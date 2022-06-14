'use strict'

// create or get this symbol.
const aoOnce = Symbol.for('AppOptics.Apm.Once')

// remember these before we've required any files so a warning can be issued if needed.
// filter out this file and the script entry script loaded when the Node.js process launched,
const alreadyLoaded = Object.keys(require.cache).filter(f => f !== __filename && f !== require.main.filename)

// if this symbol is in the global registry then set exports
// to the value cached there. Otherwise set a global property
// to exports (the bottom of the file in the else). This exists
// to prevent problems with the request package which uses
// stealthy-require to brute force multiple instantiations.
if (global[aoOnce]) {
  module.exports = global[aoOnce]
  module.exports.loggers.warn('appoptics-apm is being executed more than once')
} else {
/* eslint-disable indent */
// disable eslint's indent so it doesn't complain because everything in the else
// (all of the file when it's required the first time) isn't indented.

// make global context object with noop testing function. ao.g.testing() is
// setup differently for tests but this allows a single test to run without
// error.

const ao = exports

// global place to store stats. each module should create a separate
// namespace for its stats. e.g., ao._stats.span = {...}
ao._stats = {}

ao.version = require('../package.json').version

ao.g = {
  testing: function (filename) {
    ao.g.current = filename
  },
  taskDict: {}
}

/**
 * @class ao
 *
 * @example
 * The name ao can be any name you choose. Just require
 * appoptics-apm. In this document ao is used.
 *
 * const ao = require('appoptics-apm')
 */

// first, set up logging so problems can be reported.
const path = require('path')
const env = process.env

ao.root = path.resolve(__dirname, '..')

// don't insert traceparent/tracestate into outbound http request headers when this property is truthy.
ao.omitTraceId = Symbol('ao.omitTraceId')

const { logger, loggers } = require('./loggers')
ao.logger = logger
const log = ao.loggers = loggers

/**
 * @name ao.logLevel
 * @property {string} - comma separated list of log settings
 * @example <caption>Sets the log settings</caption>
 * ao.logLevel = 'warn,error'
 * @example <caption>Get the log settings</caption>
 * var settings = ao.logLevel
 */
Object.defineProperty(ao, 'logLevel', {
  get () { return logger.logLevel },
  set (value) { logger.logLevel = value }
})

/**
 * Add log levels to the existing set of log levels.
 *
 * @method ao.logLevelAdd
 * @param {string} levels - comma separated list of levels to add
 * @return {string|undefined} - the current log levels or undefined if an error
 *
 * @example
 * ao.logLevelAdd('warn,debug')
 */
ao.logLevelAdd = logger.addEnabled.bind(logger)

/**
 * Remove log levels from the current set.
 *
 * @method ao.logLevelRemove
 * @param {string} levels - comma separated list of levels to remove
 * @return {string|undefined} - log levels after removals or undefined if an
 *                              error.
 * @example
 * var previousLogLevel = ao.logLevel
 * ao.logLevelAdd('debug')
 * ao.logLevelRemove(previousLogLevel)
 */
ao.logLevelRemove = logger.removeEnabled.bind(logger)

// read the config file so that if it disables the agent it's possible to
// skip loading the bindings.
const uc = (require('./get-unified-config'))()

if (uc.unusedConfig.length) {
  log.warn(`properties in ${uc.file} that were not recognized: ${uc.unusedConfig.join(', ')}`)
}
if (uc.unusedEnvVars.length) {
  log.warn(`environment variables not recognized: ${uc.unusedEnvVars.join(', ')}`)
}
if (uc.unusedProbes.length) {
  log.warn(`config file probes not recognized: ${uc.unusedProbes.join(', ')}`)
}
// if there were fatal errors the agent must be disabled.
let enabled = uc.fatals.length === 0
for (let i = 0; i < uc.fatals.length; i++) {
  log.error(uc.fatals[i])
}
for (let i = 0; i < uc.errors.length; i++) {
  log.error(uc.errors[i])
}
for (let i = 0; i < uc.warnings.length; i++) {
  log.warn(uc.warnings[i])
}
for (let i = 0; i < uc.debuggings.length; i++) {
  log.debug(uc.debuggings[i])
}
for (let i = 0; i < uc.settingsErrors.length; i++) {
  log.error(uc.settingsErrors[i])
}

//
// put in their historical variables.
//
ao.probes = uc.probes
ao.specialUrls = uc.transactionSettings && uc.transactionSettings.filter(s => s.type === 'url')
ao.execEnv = uc.execEnv
const config = uc.global
ao.cfg = Object.assign({}, config)

// now that the config is known warn about files already being required if this is not development environment.
if (alreadyLoaded.length && ao.execEnv.nodeEnv !== 'development') {
  log.warn('the following files were loaded before appoptics-apm:', alreadyLoaded)
}

//
// there isn't really a better place to put this
// it takes an http request object argument.
//
ao.getDomainPrefix = function (req) {
  const h = req.headers
  const s = req.socket || { localPort: 80 }
  let prefix = (h && h['x-forwarded-host']) || h.host || ''
  const parts = prefix.split(':')
  // if the port is included in the header then use it
  if (parts.length === 2 && parts[1]) {
    return prefix
  }
  // use the first part (strips off ':' with nothing after)
  prefix = parts[0]
  if (s.localPort !== 80 && s.localPort !== 443 && prefix !== '') {
    prefix = prefix + ':' + s.localPort
  }
  return prefix
}

//
// Utility function to create function that issues consistently formatted
// messages for patching errors.
//
ao.makeLogMissing = function makeLogMissing (name) {
  const s = `probes.${name} "%s" not found`
  return function logMissing (missing) {
    log.patching(s, missing)
  }
}

//
// now go through a sequence of checks and tests that can result in
// appoptics being disabled. accumulate the errors so a summary message
// with the enabled status can be output at the end of the checks.
//
enabled = enabled && config.enabled
const errors = []

const disabledByConfig = 'configuration'
if (!enabled) {
  errors.push(disabledByConfig)
}

// if the serviceKey is not valid then the agent cannot be enabled unless
// running in AWS lambda.
if (ao.execEnv.type !== 'serverless' || ao.execEnv.id !== 'lambda') {
  enabled = enabled && config.serviceKey
}

//
// map valid modes to oboe values for an easy way to validate/convert. They are defined
// here so they can be used when processing the config file.
//
Object.defineProperty(ao, 'modeMap', {
  get () {
    return { 0: 0, 1: 1, never: 0, always: 1, disabled: 0, enabled: 1 }
  }
})

Object.defineProperty(ao, 'modeToStringMap', {
  get () {
    return { 0: 'disabled', 1: 'enabled' }
  }
})

//
// Load continuation-local-storage
//
const contextProviders = {
  clsHooked: 'cls-hooked',
  aceContext: 'ace-context'
}
// if set via environment variable use that context provider otherwise
if (env.AO_CONTEXT in contextProviders) {
  ao.contextProvider = contextProviders[env.AO_CONTEXT]
} else {
  ao.contextProvider = contextProviders.aceContext
}

log.debug('using context provider:', ao.contextProvider)
// load the context provider
try {
  ao.cls = require(ao.contextProvider)
} catch (e) {
  enabled = false
  log.error('Can\'t load %s', ao.contextProvider, e.stack)
  errors.push('context provider not loaded')
}

//
// Try to load bindings if not disabled. Handle failure or disabled
// gracefully.
//
let bindings

if (enabled && !env.AO_TEST_NO_BINDINGS) {
  try {
    bindings = require('@appoptics/apm-bindings')
  } catch (e) {
    const args = ['Can\'t load bindings']
    if (e.code !== 'MODULE_NOT_FOUND') {
      args.push(e.stack)
    }
    log.error.apply(log, args)
    errors.push(`require failed: ${e.code ? e.code : ''}`)
  }
} else {
  let msg
  if (errors.length) {
    if (errors.indexOf(disabledByConfig) === -1) {
      msg = 'appoptics-bindings not loaded due to previous errors'
    }
  } else {
    msg = `appoptics-bindings not loaded by ${enabled ? 'env' : 'config'}`
  }
  if (msg) {
    log.debug(msg)
    errors.push(msg)
  }
}

// whether because explicitly disabled or an error get the essentials
if (!bindings) {
  enabled = false
  bindings = require('./addon-sim')
}
ao.addon = bindings

//
// issue a summary error message if the agent is disabled.
//
if (!enabled) {
  if (errors.length && errors[0] === 'disabled by config file') {
    log.debug(`${errors[0]}: ${uc.file}`)
  } else {
    log.error('AppopticsAPM disabled due to: %s', errors.join(', '))
  }
}

// this is not a class in bindings v6. addon-sim will provide
// skeleton functions if bindings is not available.
ao.reporter = bindings.Reporter

// set up a debugging logging controller for specific places
ao.control = { logging: {} }

// don't issue errors for what are normal situations at startup.
let startup = true
Object.defineProperty(ao, 'startup', {
  get () {
    return startup
  },
  set (value) {
    startup = value
  }
})

/**
 * Expose debug logging global and create a function to turn
 * logging on/off.
 *
 * @name ao.loggers
 * @property {object} - the loggers available for use
 */
ao.debugLogging = function (setting) {
  log.enabled = setting
}

// give a quick update
const x = enabled ? '' : '(disabled)'
log.debug(
  `apm ${ao.version}${x}, bindings ${bindings.version}, oboe ${bindings.Config.getVersionString()}`
)

//
// bring in the api or simulated api. it needs access to ao.
//
const api = require(enabled ? './api' : './api-sim')(ao)

for (const k of Object.keys(api)) {
  if (k in ao) {
    log.error(`api key ${k} conflicts, skipping`)
  } else {
    ao[k] = api[k]
  }
}

ao.Event.init(ao)
ao.Span.init(ao)

if (config.traceMode === 0) {
  log.debug('tracing disabled by config')
}

//
// now that the api is loaded the trace mode can be set
//
ao.traceMode = ao.cfg.traceMode

// and make enabled reflect the final decision
ao.cfg.enabled = !!enabled

//
// the rest of the code is only relevant if bindings are loaded.
//
if (enabled) {
  const options = Object.assign({}, ao.cfg)
  if (ao.execEnv.type !== 'serverless' || ao.execEnv.id !== 'lambda') {
    delete options.sampleRate
  }
  options.mode = 1

  // replace the serviceKey with our cleansed service key. the agent
  // will be disabled if the service key doesn't at least look valid.
  // options.serviceKey = cleansedKey;

  //
  // initialize liboboe.
  //
  const status = bindings.oboeInit(options)

  // make sure things are in sync for the lambda environment
  if (ao.execEnv.id === 'lambda') {
    if (bindings.Reporter.getType() !== 'lambda') {
      log.error(`execution environment mismatch ${ao.execEnv.id} vs. ${bindings.Reporter.getType()}`)
    }
    let av = 'n/a'
    try {
      const p = require('appoptics-auto-lambda/package.json')
      if ('version' in p) av = p.version
    } catch (e) {}

    let previous
    // if info is not enabled enable it for long enough to output the versions
    if (!ao.logger.has('info')) {
      previous = ao.logLevel
      ao.logLevelAdd('info')
    }
    const x = enabled ? '' : '(disabled)'
    const aov = ao.version
    const abv = bindings.version
    const clv = bindings.Config.getVersionString()
    ao.loggers.info(`apm ${aov}${x}, bindings ${abv}, oboe ${clv}, auto ${av}`)
    if (previous) {
      ao.logLevel = previous
    }
  }

  if (ao.cfg.sampleRate !== undefined) {
    ao.sampleRate = ao.cfg.sampleRate
  }

  if (status > 0) {
    log.error(`failed to initialize, error: ${status}`)
  }

  ao.fs = require('fs')

  //
  // Collect module data before patching fs
  //
  const base = path.join(process.cwd(), 'node_modules')
  let modules
  try {
    modules = ao.fs.readdirSync(base)
  } catch (e) {}
  delete ao.fs

  const moduleData = {}
  if (Array.isArray(modules)) {
    modules.forEach(mod => {
      if (mod === '.bin' || mod[0] === '@') return
      try {
        const pkg = require(`${base}/${mod}/package.json`)
        moduleData[`Node.Module.${pkg.name}.Version`] = pkg.version
      } catch (e) {}
    })
  }

  //
  // Enable require monkey-patcher
  //
  if (enabled) {
    // patching registers all probes
    const patcher = require('./require-patch')
    // de-register those probes that have a registered property been specifically set to false
    Object.keys(ao.probes).filter(prob => ao.probes[prob].registered === false).forEach(probe => patcher.deregister(probe))
    patcher.enable()
  }

  //
  // start metrics and send __Init event
  //
  process.nextTick(function () {
    if (enabled) {
      if (config.runtimeMetrics) {
        if (ao.execEnv.type !== 'serverless' || ao.execEnv.id !== 'lambda') {
          ao.loggers.debug('starting runtimeMetrics')
          ao.metrics = new ao.Metrics()
          ao.metrics.start()
        } else {
          ao.loggers.debug('config.runtimeMetrics overridden by lambda environment')
        }
      }

      ao.requestStore.run(function () {
        const v = process.versions
        const data = {
          __Init: 1,
          Layer: 'nodejs',
          Label: 'single',
          'Node.Version': v.node,
          'Node.V8.Version': v.v8,
          'Node.LibUV.Version': v.uv,
          'Node.OpenSSL.Version': v.openssl,
          'Node.Ares.Version': v.ares,
          'Node.ZLib.Version': v.zlib,
          'Node.HTTPParser.Version': v.llhttp || v.http_parser,
          'Node.AppOptics.Version': ao.version,
          'Node.AppOpticsExtension.Version': bindings.Config.getVersionString(),
          ...moduleData
        }

        log.info('making nodejs:single event')
        const md = bindings.Event.makeRandom(1)
        const e = new ao.Event('nodejs', 'single', md)

        const status = e.sendStatus(data)
        if (status < 0) {
          log.error(`init.sendStatus() failed (${status})`)
        } else {
          log.info('init.sendStatus() succeeded')
        }
      })

      startup = false
      log.info('startup completed')
    }
  })

// this is the end of the bindings enabled check
}

// this is the end of the unindented check around whether the
// file has already been loaded.
//
// cache the exports in our own global so they can be reused
// if a package like "stealthy-require" clears node's require
// cache.
global[aoOnce] = ao
}
