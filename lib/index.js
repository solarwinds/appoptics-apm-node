'use strict'

// create or get this symbol.
const aoOnce = Symbol.for('AppOptics.Apm.Once')

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
exports.g = {
  testing: function (filename) {
    exports.g.current = filename
  },
  taskDict: {}
}

/**
 * @class ao
 *
 * @example
 * The name ao can be any name you choose. Just require
 * appoptics-apm: In this document ao is used.
 *
 * const ao = require('appoptics-apm')
 */

// read the config file first so that if it disables appoptics then
// the bindings are not loaded.
const path = require('path')
const log = require('./loggers')
const env = process.env

const defaultConfigFile = path.join(process.cwd(), 'appoptics-apm')
let configFile = defaultConfigFile
if (env.APPOPTICS_APM_CONFIG_NODE) {
  configFile = path.relative(process.cwd(), env.APPOPTICS_APM_CONFIG_NODE)
}

// only these non-probe defaults are taken from the
// config file. because probes have a variety of
// probe-dependent options those are not restricted in
// the same way.
const configDefaults = {
  enabled: true,
  hostnameAlias: undefined,
  traceMode: undefined,
  sampleRate: undefined,
  serviceKey: undefined,
  ignoreConflicts: false,
  domainPrefix: false,
}

const debug = require('debug')
exports.debug = debug

// initialize log settings (internally 'appoptics:' is stripped)
let logLevel = []
if (env.DEBUG) {
  logLevel = env.DEBUG.split(',')
    .filter(p => p.startsWith('appoptics:'))
    .map(p => p.slice('appoptics:'.length))
}

/**
 * @name ao.logLevel
 * @property {string} - comma separated list of log settings
 * @example <caption>Sets the log settings</caption>
 * ao.logLevel = 'warn,error'
 * @example <caption>Get the log settings</caption>
 * var settings = ao.logLevel
 */
Object.defineProperty(exports, 'logLevel', {
  get () {return logLevel.join(',')},
  set (value) {
    if (typeof value === 'string') {
      value = value.split(',').map(p => p.trim())
    }
    if (Array.isArray(value)) {
      // find any DEBUG settings that aren't appoptics and preserve them.
      let notao = []
      if (env.DEBUG) {
        notao = env.DEBUG.split(',').filter(p => !p.startsWith('appoptics:'))
      }
      logLevel = value
      debug.enable(logLevel.map(p => 'appoptics:' + p).concat(notao).join(','))
    }
  }
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
exports.logLevelAdd = function (levels) {
  if (typeof levels !== 'string') {
    log.warn('logLevelAdd argument not a string: %s', typeof levels)
    return
  }
  exports.logLevel += ',' + levels
  return exports.logLevel
}

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
exports.logLevelRemove = function (levels) {
  if (typeof levels !== 'string') {
    log.warn('logLevelRemove argument not a string: %s', typeof levels)
    return
  }
  levels = levels.split(',').map(l => 'appoptics:' + l)
  const after = env.DEBUG.split(',')
    .filter(p => !p.startsWith('appoptics:') || !~levels.indexOf(p))
    .map(p => p.slice('appoptics:'.length))
  exports.logLevel = after
  return after
}

// if appoptics is not specified in DEBUG then default. if it is
// specified then override the default.
if (!('DEBUG' in env) || !~env.DEBUG.indexOf('appoptics:')) {
  exports.logLevel = 'error,warn'
}

//
// read the user configuation file if it exists.
//
let config
try {
  config = require(configFile)
} catch (e) {
  config = {}
  // if not found only log an error if it is a user specified file, not
  // the default.
  if (e.code !== 'MODULE_NOT_FOUND' || configFile !== defaultConfigFile) {
    log.error('Cannot read config file %s', configFile)
  }
}
exports.cfg = {}

// only consider valid keys
for (const key of Object.keys(configDefaults)) {
  exports.cfg[key] = key in config ? config[key] : configDefaults[key]
}

// do the probes manually so configDefaults doesn't need to duplicate
// every probe from ./defaults.
exports.cfg.probes = config.probes

// TODO BAM consider warning if unused keys?
// replace what was read from the file with the valid configuration keys
config = exports.cfg
if (!config.probes) {
  config.probes = {}
}

exports.probes = {}

// Mix probe-specific configs with defaults.
const probeDefaults = require('./defaults')
Object.keys(probeDefaults.probes).forEach(mod => {
  exports.probes[mod] = probeDefaults.probes[mod]
  Object.assign(exports.probes[mod], config.probes[mod] || {})
})

// there isn't really a better place to put this
// it takes an http request object argument.
exports.getDomainPrefix = function (req) {
  const h = req.headers
  const s = req.socket || {localPort: 80}
  let prefix = h && h['x-forwarded-host'] || h['host'] || ''
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

exports.makeLogMissing = function makeLogMissing (name) {
  const s = `probes.${name} "%s" not found`
  return function logMissing (missing) {
    log.patching(s, missing)
  }
}

//
// Disable module when conflicts are found
//
if (!config.ignoreConflicts) {
  const modules = Object.keys(require.cache)
  const possibleConflicts = [
    'newrelic',
    'strong-agent',
    'appdynamics'
  ]
  function checkMod (conflict, mod) {
    return (new RegExp(`/node_modules/${conflict}/`)).test(mod)
  }
  const conflicts = possibleConflicts.filter(conflict => {
    return modules.filter(mod => checkMod(conflict, mod)).length > 0
  })

  function andList (list) {
    const last = list.pop()
    return (list.length ? list.join(', ') + ', and ' : '') + last
  }

  if (conflicts.length > 0) {
    enabled = false
    log.error([
      'Users have reported that the following modules conflict',
      `with AppOptics instrumentation: ${andList(conflicts)}.`,
      'Please uninstall them and restart the application.'
    ].join(' '))
  }
}

function validKey (key) {
  return !!key.match(/^[A-Fa-f0-9]{64}:[a-z0-9.:_-]{1,255}$/)
}

// mask the service key so it's not revealed when logging. do not presume a
// a valid service key, i.e., 64-hex-digits:1-to-255-valid-name
function mask (key) {
  const parts = key.split(':')
  let keyOnly = parts.shift()
  if (keyOnly.length < 8) {
    keyOnly += '.'.repeat(8 - key.length)
  }
  return keyOnly.slice(0, 4) + '...' + keyOnly.slice(-4) + ':' + parts.join(':')
}

//
// if the service key is defined in the environment then use that. if
// not see if it is defined in the config file.
//
const environmentKey = process.env.APPOPTICS_SERVICE_KEY
let serviceKey = environmentKey
// make sure service key is not undefined and use config value if present
if (!serviceKey) {
  serviceKey =  ''
  if (config.serviceKey) {
    log.debug('using config.serviceKey')
    serviceKey = config.serviceKey
  }
}

// remember if the original key is valid so if the only modification
// is lowercasing it we don't log a warning.
const originalKeyValid = validKey(serviceKey)

// lower case, spaces to hyphens, allow only [a-z0-9.:_-]
const cleansedKey = serviceKey.toLowerCase()
  .replace(/ /g, '-')
  .replace(/[^a-z0-9.:_-]/g, '')

// save the key that is being used
/**
 * @name ao.serviceKey
 * @property {string} - the service key
 */
exports.serviceKey = cleansedKey

// now go through a sequence of checks and tests that can result in
// appoptics being disabled. accumulate the errors so a single message
// with the enabled status can be output at the end of the checks.
let enabled = config.enabled
const errors = []

if (!validKey(cleansedKey)) {
  enabled = false
  log.error('No valid serviceKey')
  errors.push('no valid service key')
} else if (!originalKeyValid) {
  log.warn('Invalid service key specified: "%s", using: "%s"', mask(serviceKey), mask(cleansedKey))
} else {
  log.debug('Setting ao.serviceKey to %s', mask(cleansedKey))
}

//
// Try to load bindings if not disabled. Handle failure or disabled
// gracefully.
//
let bindings

if (config.traceMode !== undefined && !(config.traceMode in modeMap)) {
  enabled = false
  log.error('invalid traceMode: %s', config.traceMode)
  errors.push('invalid traceMode')
}

if (enabled) {
  try {
    bindings = require('appoptics-bindings')
  } catch (e) {
    enabled = false
    log.error('Can\'t load bindings', e.stack)
    errors.push('bindings not loaded')
  }
}

exports.addon = bindings

// map valid modes to oboe values for an easy way to validate/convert.
const modeMap = {
  0: bindings ? bindings.TRACE_NEVER : 0,
  1: bindings ? bindings.TRACE_ALWAYS : 1,
  never: bindings ? bindings.TRACE_NEVER : 0,
  always: bindings ? bindings.TRACE_ALWAYS : 1
}

//
// Load dependencies
//
// TODO BAM consider not loading these at all if not enabled.
const contextProviders = {
  cls: 'continuation-local-storage',
  clsHooked: 'cls-hooked'
}
// if set via environment variable use that context provider otherwise
// base the decision on the node version.
if (env.AO_CLS in contextProviders) {
  exports.contextProvider = contextProviders[env.AO_CLS]
} else {
  exports.contextProvider = contextProviders.clsHooked
}
log.debug('using context provider:', exports.contextProvider)

let cls
try {
  cls = require(exports.contextProvider)
} catch (e) {
  enabled = false
  log.error('Can\'t load %s', exports.contextProvider, e.stack)
  errors.push('context provider not loaded')
}

const WeakMap = require('es6-weak-map')
const shimmer = require('ximmer')
const fs = require('fs')

exports.version = require('../package.json').version

function clsCheck (msg) {
  const c = exports.requestStore
  const ok = c && c.active
  if (msg) {
    log.debug('CLS%s %s', ok ? '' : ' NOT ACTIVE', msg)
  }
  return ok
}

exports.clsCheck = clsCheck

if (!enabled) {
  log.error('AppopticsAPM disabled due to: %s', errors.join(', '))
}


// Eagerly create variables to store classes.
// ES6 does not hoist let statements.
let Event
let Span
let Profile

const ao = exports   // eslint-disable-line no-unused-vars

//
// Create a reporter
//
try {
  if (typeof bindings.Reporter === 'function') {
    exports.reporter = new bindings.Reporter()
  } else {
    exports.reporter = bindings.Reporter
  }
} catch (e) {
  const zoreReporter = function () {return 0}     // zero or error
  const torfReporter = function () {return true}  // true or false
  const zstrReporter = function () {return ''}    // zero length string
  // supply functions in case they are called
  exports.reporter = {
    sendReport: zoreReporter,
    sendStatus: zoreReporter,
    sendHttpSpan: zstrReporter,
    isReadyToSample: torfReporter
  }
  if (enabled) {
    log.error('Reporter unable to connect')
  }
}


//
// Abstract settings with setters and getters
//
let sampleMode, sampleRate, sampleSource

/**
 * Check whether the appoptics agent is ready to sample. It will wait up to
 * the specified number of milliseconds before returning.
 * @method ao.readyToSample
 * @param {Number} ms - milliseconds to wait; default 0 means don't wait (poll).
 * @param {Object} [obj] - if present obj.status will receive low level status
 * @returns {boolean} - true if ready to sample; false if not
 */
/**
 * @ignore
 * UNKNOWN 0
 * OK 1
 * TRY_LATER 2
 * LIMIT_EXCEEDED 3
 * INVALID_API_KEY 4
 * CONNECT_ERROR 5
 */
exports.readyToSample = function (ms, obj) {
  const status = exports.reporter.isReadyToSample(ms)
  // if the caller wants the actual status provide it
  if (obj && typeof obj === 'object') {
    obj.status = status
  }

  return status === 1
}

/**
 * Get and set the sample mode
 *
 * @name ao.sampleMode
 * @property {string} - the sample mode
 */
Object.defineProperty(exports, 'sampleMode', {
  get () {return sampleMode},
  set (value) {
    if (!(value in modeMap)) {
      log.error('invalid traceMode', value)
      return
    }
    log.settings('set traceMode to ' + value)
    value = modeMap[value]
    if (enabled) {
      bindings.Context.setTracingMode(value)
    }
    sampleMode = value
  }
})

/**
 * Get and set the sample mode. This is an alias for 'sampleMode' and
 * is for consistency with other agents and history.
 *
 * @name ao.traceMode
 * @property {string} - the sample mode
 */
Object.defineProperty(exports, 'traceMode', {
  get () {return exports.sampleMode},
  set (value) {exports.sampleMode = value}
})

/**
 * This stores the sample source globally for later use
 * in KV pairs.
 *
 * @ignore
 * @name ao.sampleSource
 * @property {number}
 */
Object.defineProperty(exports, 'sampleSource', {
  get () {return sampleSource},
  set (value) {sampleSource = value}
})

/**
 * Get and set the sample rate. The number is parts of 1,000,000
 * so 100,000 represents a 10% sample rate.
 *
 * @name ao.sampleRate
 * @property {number} - this value divided by 1000000 is the sample rate.
 */
Object.defineProperty(exports, 'sampleRate', {
  get () {return sampleRate},
  set (value) {
    log.settings('set sample rate to ' + value)
    if (enabled) {
      const rateUsed = bindings.Context.setDefaultSampleRate(value)
      if (rateUsed !== value && value !== -1) {
        if (rateUsed === -1) {
          // value was not a valid number, don't use it
          log.warn('Invalid sample rate: %s, not changed', value)
          return;
        }
        //
        log.warn('Sample rate (%s) out of range, using %s', value, rateUsed)
      }
      sampleRate = rateUsed
    }
  }
})


// Sugar to detect if the current mode is of a particular type
Object.keys(modeMap).forEach(mode => {
  Object.defineProperty(exports, mode, {
    get () {return sampleMode === modeMap[mode]}
  })
})


//
// Use continuation-local-storage to follow traces through a request
//
const storeName = 'ao-request-store'
Object.defineProperty(exports, 'requestStore', {
  get () {
    return cls.getNamespace(storeName) || cls.createNamespace(storeName)
  }
})

exports.resetRequestStore = function () {
  cls.destroyNamespace(storeName)
}

/**
 * Return whether or not the current code path is being traced.
 *
 * @name ao.tracing
 * @property {boolean}
 * @readOnly
 */
Object.defineProperty(exports, 'tracing', {
  get () {return !!Event.last}
})

/**
 * Get X-Trace ID of the last event
 *
 * @name ao.traceId
 * @property {string} - the trace ID as a string or undefined if not tracing.
 * @readOnly
 */
Object.defineProperty(exports, 'traceId', {
  get () {
    const last = Event && Event.last
    if (last) return last.toString()
  }
})

Object.defineProperty(exports, 'lastEvent', {
  get () {
    return Event && Event.last
  }
})

Object.defineProperty(exports, 'lastSpan', {
  get () {
    return Span && Span.last
  }
})

/**
 * Expose debug logging global and create a function to turn
 * logging on/off.
 *
 * @name ao.loggers
 * @property {object} - the loggers available for use
 */
exports.loggers = log
exports.debugLogging = function (setting) {
  log.enabled = setting
}

//
// ao.stackTrace
//
exports.stack = function (text, n) {
  const original = Error.stackTraceLimit
  // increase the stackTraceLimit by one so this function call
  // can be removed.
  if (!n) {
    n = Error.stackTraceLimit
  }
  Error.stackTraceLimit = n + 1

  const e = new Error(text)
  const stackLines = e.stack.split('\n')

  Error.stackTraceLimit = original
  // remove the call to this function
  return [stackLines[0]].concat(stackLines.slice(2)).join('\n')
}

/**
 * Bind a function to the CLS context if tracing.
 *
 * @method ao.bind
 * @param {function} fn - The function to bind to the context
 * @return {function} The bound function or the unmodified argument if it can't
 *   be bound.
 */
exports.bind = function (fn) {
  try {
    if (exports.tracing && typeof fn === 'function') {
      return exports.requestStore.bind(fn)
    }

    const name = fn ? fn.name : 'anonymous'
    // it's not quite right so issure diagnostic message
    if (!clsCheck()) {
      const e = new Error('CLS NOT ACTIVE')
      log.warn('ao.bind(%s) - no context', name, e.stack)
    } else if (!exports.tracing) {
      log.warn('ao.bind(%s) - not tracing', name)
    } else if (fn !== undefined) {
      const e = new Error('Not a function')
      log.warn('ao.bind(%s) - not a function', fn, e.stack)
    }
  } catch (e) {
    log.error('failed to bind callback', e.stack)
  }

  // return the caller's argument no matter what.
  return fn
}

const dbNoContext = new log.Debounce('warn')
const dbNotTracing = new log.Debounce('info')
const dbNotEmitter = new log.Debounce('error')
const dbUnknown = new log.Debounce('info')

/**
 * Bind an emitter, if tracing
 *
 * @method ao.bindEmitter
 * @param {EventEmitter} em The emitter to bind to the trace context
 * @return {EventEmitter} The bound emitter or the original emitter if an error.
 */
exports.bindEmitter = function (em) {
  let emitter = false
  try {
    if (em && typeof em.on === 'function') {
      emitter = true
      // allow binding if tracing or an http emitter (duck-typing check). no
      // last event has been setup when the http instrumentation binds the
      // events but there must be CLS context.
      if (exports.tracing || (clsCheck() && (em.headers && em.socket))) {
        exports.requestStore.bindEmitter(em)
        return em
      }
    }

    const e = new Error('CLS NOT ACTIVE')
    if (!clsCheck()) {
      dbNoContext.log('ao.bindEmitter - no context', e.stack)
    } else if (!exports.tracing) {
      dbNotTracing.log('ao.bindEmitter - not tracing')
    } else if (!emitter) {
      dbNotEmitter.log('ao.bindEmitter - non-emitter', e.stack)
    } else {
      dbUnknown.log('ao.bindEmitter - couldn\'t bind emitter')
    }
  } catch (e) {
    log.error('failed to bind emitter', e.stack)
  }

  // return the original if it couldn't be bound for any reason.
  return em
}


/**
 * Generate a backtrace string
 *
 * @method ao.backtrace
 */
exports.backtrace = function ()  {
  const e = new Error('backtrace')
  return e.stack.replace(/^.*\n\s*/, '').replace(/\n\s*/g, '\n')
}

/**
 * Set a custom transaction name function for a specific probe. This is
 * most commonly used when setting custom names for all or most routes.
 *
 * @method ao.setCustomTxNameFunction
 * @param {string} probe - The probe to set the function for
 * @param {function} fn - A function that returns a string custom name or a
 *                        falsey value indicating the default should be used.
 *                        Pass a falsey value for the function to clear.
 *
 * @example
 * // custom transaction function signatures for supported probes:
 * express: customFunction (req, res)
 * hapi: customFunction (request)
 */
exports.setCustomTxNameFunction = function (probe, fn) {
  // if the probe exists set the function and return success
  if (probe in exports.probes && typeof fn === 'function') {
    exports.probes[probe].customNameFunc = fn
    return true
  }
  // return failure
  return false
}

/**
 * Set the custom transaction name for a context associated with an http
 * response.
 *
 * This is commonly used when custom names are desired for a small subset
 * of the routes
 *
 * TODO BAM - needs reworked to handle non-HTTP traces. NYI
 *
 * @ignore
 * @param {string} name - the string name to set
 *
 */
/*
exports.SetCustomTxName = function (name) {
  // TODO BAM validate req & res objects
  if (name && typeof name === 'string') {
    res._ao_metrics.txname = name
  }
}
// */

function noop () {}

//
// The remaining things require bindings to be present.
// TODO: Make Span, Profile and Event exportable without liboboe
//
if (!enabled) {
  exports.reportError = noop
  exports.reportInfo = noop
  exports.sample = function () {
    return {sample: false, source: 1, rate: 1}
  }
  exports.instrument = function (build, run, opts, cb) {
    return run(typeof opts === 'function' ? opts : cb)
  }
  exports.startOrContinueTrace = function (xtrace, build, run, opts, cb) {
    return run(typeof opts === 'function' ? opts : cb)
  }
} else {
  //
  // initialize liboboe
  //
  const options = {}
  if (exports.cfg.hostnameAlias) {
    options.hostnameAlias = exports.cfg.hostnameAlias
  }

  // delete the environment variable, init oboe, and restore it. this is
  // done because oboe will prefer the environment variable to anything
  // specified here.
  delete env.APPOPTICS_SERVICE_KEY
  bindings.oboeInit(cleansedKey, options)
  if (environmentKey || environmentKey === '') {
    env.APPOPTICS_SERVICE_KEY = environmentKey
  }

  /**
   * @typedef {object} SampleInfo
   * @property {boolean} sample - whether to sample or not
   * @property {number} source - the source of the sample decision
   * @property {number} rate - the rate that was used to make the decision
   */

  /**
   * Determine if the request should be sampled. Store the source
   * and rate.
   *
   * @ignore
   * @method ao.sample
   * @param {string} serviceName - currently unused
   * @param {string} xtrace - x-trace header continuing from, or null
   * @returns {SampleInfo}
   */
  exports.sample = function (serviceName, xtrace) {
    const r = bindings.Context.sampleTrace('', xtrace || '')
    sampleSource = r.source
    sampleRate = r.rate
    return r
  }

  /**
   * Determine if the sample flag is set for the various forms of
   * metadata.
   *
   * @method ao.sampling
   * @param {string|Event|Metadata} item - the item to get the sampling flag of
   * @returns {boolean} - true if the sample flag is set else false.
   */

  exports.sampling = function (item) {
    if (typeof item === 'string') {
      return item.length === 60 && item[59] === '1'
    }

    if (item instanceof Event) {
      return item.event.getSampleFlag()
    }

    if (item instanceof bindings.Metadata) {
      return item.getSampleFlag()
    }

    throw new Error('Sampling called with ' + item)
  }

  /**
   * Convert an xtrace ID to a metadata object.
   *
   * @method ao.stringToMetadata
   * @param {string} metadata - string metadata (X-Trace ID)
   * @return {bindings.Metadata|undefined} - bindings.Metadata object if
   *                                         successful.
   */
  exports.stringToMetadata = function (mdString) {
    // if the conversion fails undefined is returned
    return bindings.Metadata.fromString(mdString)
  }


  /**
   * Patch an HTTP response object to trigger ao-response-end events
   *
   * @ignore
   * @method ao.patchResponse
   * @param {HTTPResponse} res HTTP Response object
   */
  const responseIsPatched = new WeakMap()
  exports.patchResponse = function (res) {
    if (!responseIsPatched.get(res)) {
      responseIsPatched.set(res, true)
      shimmer.wrap(res, 'end', fn => function () {
        // Find and run finalizers
        const finalizers = responseFinalizers.get(res) || []
        finalizers.reverse().forEach(finalizer => finalizer())

        // Cleanup after ourselves
        responseFinalizers.delete(res)
        responseIsPatched.delete(res)

        // Run the real end function
        return fn.apply(this, arguments)
      })
    }
  }


  /**
   * Add a finalizer to trigger when the response ends
   *
   * @ignore
   * @method ao.addResponseFinalizer
   * @param {HTTPResponse} res - HTTP Response to attach a finalizer to
   * @param {function} finalizer - Finalization function
   */
  const responseFinalizers = new WeakMap()
  exports.addResponseFinalizer = function (res, finalizer) {
    const finalizers = responseFinalizers.get(res)
    finalizers
      ? finalizers.push(finalizer)
      : responseFinalizers.set(res, [finalizer])
  }


  /**
   * Instrument HTTP request/response
   *
   * @method ao.instrumentHttp
   * @param {string|function} build - span name or builder function
   * @param {function} run - code to instrument and run
   * @param {object} [options] - options
   * @param {object} [options.enabled] - enable tracing, on by default
   * @param {object} [options.collectBacktraces] - collect backtraces
   * @param {HTTPResponse} res - HTTP response to patch
   */
  exports.instrumentHttp = function (build, run, options, res) {
    // If not tracing, skip
    const last = Span.last
    if (!last) {
      log.warn('instrumentHttp: no last span')
      return run()
    }
    if (!options.enabled) {
      log.info('instrumentHttp: disabled by option')
      return run()
    }

    exports.patchResponse(res)

    let span
    try {
      // Build span
      span = typeof build === 'function' ? build(last) : last.descend(build)

      // Attach backtrace, if enabled
      if (options.collectBacktraces) {
        span.events.entry.Backtrace = exports.backtrace(4)
      }
    } catch (e) {
      log.error('instrumentHttp failed to build span %s', e.stack)
    }

    let ctx
    try {
      if (span && !span.descended) {
        ctx = exports.requestStore.createContext()
        exports.requestStore.enter(ctx)
      }
    } catch (e) {
      log.error('instrumentHttp failed to enter span %l', span)
    }

    if (span) {
      span.enter()
      exports.addResponseFinalizer(res, () => {
        span.exit()
        try {
          if (ctx) {
            exports.requestStore.exit(ctx)
          } else if (!span.descended) {
            log.error('no context for undescended span')
          }
        } catch (e) {
          log.error('instrumentHttp failed to exit span %l', span)
        }
      })
    }

    try {
      return run.call(span)
    } catch (err) {
      if (span) span.setExitError(err)
      throw err
    }
  }

  // don't issue errors during startup
  let startup = true

  /**
   * Apply custom instrumentation to a function.
   *
   * @method ao.instrument
   * @param {string|function} build - span name or builder function
   *     If `build` is a string then a span is created with that name. If it
   *     is a function it will be run only if tracing; it must generate a
   *     a span.
   * @param {function} run - the function to instrument<br/><br/>
   *     Synchronous `run` function:<br/>
   *     the signature has no callback, e.g., `function run () {...}`. If a
   *     synchronous `run` function throws an error appoptics will report that
   *     error for the span and re-throw the error.<br/>
   *     <br/>
   *     Asynchronous `run` function:<br/>
   *     the signature must include a done callback that is used to let
   *     AppOptics know when your instrumented async code is done running,
   *     e.g., `function run (done) {...}`. In order to report an error for
   *     an async span the done function must be called with an Error object
   *     as the argument.
   * @param {object} [options] - options
   * @param {boolean} [options.enabled=true] - enable tracing
   * @param {boolean} [options.collectBacktraces=false] - collect stack traces.
   * @param {function} [callback] - optional callback, if async
   *
   * @example
   * //
   * // A synchronous `run` function.
   * //
   * //   If the run function is synchronous the signature does not include
   * //   a callback, e.g., `function run () {...}`.
   * //
   *
   * function build (last) {
   *   return last.descend('custom', {Foo: 'bar'})
   * }
   *
   * function run () {
   *   const contents = fs.readFileSync('some-file', 'utf8')
   *   // do things with contents
   * }
   *
   * ao.instrument(build, run)
   *
   * @example
   * //
   * // An asynchronous `run` function.
   * //
   * // Rather than callback directly, you give the done argument.
   * // This tells AppOptics when your instrumented code is done running.
   * //
   * // The `callback` function is the callback you normally would have given
   * // directly to the code you want to instrument. It receives the same
   * // arguments as were received by the `done` callback for the `run` function
   * // and the same `this` context is also applied to it.
   *
   * function build (last) {
   *   return last.descend('custom', {Foo: 'bar'})
   * }
   *
   * function run (done) {
   *   fs.readFile('some-file', done)
   * }
   *
   * function callback (err, data) {
   *   console.log('file contents are: ' + data)
   * }
   *
   * ao.instrument(build, run, callback)
   */
  exports.instrument = function (build, run, options, callback) {
    // Verify that a run function is given
    if (typeof run !== 'function') return

    // Normalize dynamic arguments
    try {
      if (typeof options !== 'object') {
        callback = options
        options = {enabled: true}
      } else {
        // default enabled to true if not explicitly false
        options = Object.assign({enabled: true}, options)
      }

      if (!callback && run.length) {
        callback = noop
      }
    } catch (e) {
      log.error('ao.instrument failed to normalize arguments', e.stack)
    }

    // If not tracing, there is some error, skip.
    const last = Span.last
    if (!last) {
      if (!startup) {
        log.info('ao.instrument found no lastSpan')
      }
      return run(callback)
    }

    // If not enabled, skip but maintain context
    if (!options.enabled) {
      log.info('ao.instrument disabled by option')
      return run(exports.bind(callback))
    }

    return runInstrument(last, build, run, options, callback)
  }

  //
  // This builds a span descending from the supplied span using the arguments
  // expected of a ao.instrument(), ao.startTrace() or ao.continueTrace() call.
  //
  function runInstrument (last, make, run, options, callback) {
    // Verify that a builder function or span name is given
    if (!~['function', 'string'].indexOf(typeof make)) {
      log.warn('ao.runInstrument found no span name or builder')
      return run(callback)
    }

    // Build span. Because last must exist this function cannot be used
    // for a root span.
    let span
    try {
      span = typeof make === 'function' ? make(last) : last.descend(make)
    } catch (e) {
      log.error('ao.runInstrument failed to build span', e.stack)
    }

    // run span
    return runSpan(span, run, options, callback)
  }

  //
  // Set backtrace, if configured to do so, and run already constructed span
  //
  function runSpan (span, run, options, callback) {
    if (!span) {
      return run(callback)
    }

    // Attach backtrace, if enabled
    if (options.collectBacktraces) {
      span.events.entry.Backtrace = exports.backtrace()
    }

    // Detect if sync or async, and run span appropriately
    return callback
      ? span.runAsync(makeWrappedRunner(run, callback))
      : span.runSync(run)
  }

  //
  // called by startOrContinueTrace
  //
  function runRootSampled (span, run, options, callback) {
    // Attach backtrace, if enabled
    if (options.collectBacktraces) {
      span.events.entry.Backtrace = exports.backtrace()
    }

    return callback
      ? span.runAsync(makeWrappedRunner(run, callback), options)
      : span.runSync(run, options)
  }

  //
  // Called by startOrContinueTrace
  //
  function runRootUnsampled (span, run, options, callback) {
    // if not sampled no need to even check option for backtraces.

    return callback
      ? span.runAsync(makeWrappedRunner(run, callback), options)
      : span.runSync(run, options)
  }


  // This makes a callback-wrapping span runner
  function makeWrappedRunner (run, callback) {
    return wrap => run(wrap(callback))
  }

  /**
   * Start or continue a trace. Continue is in the sense of continuing a
   * trace based on an X-Trace ID received from an external source, e.g.,
   * HTTP headers or message queue headers.
   *
   * @method ao.startOrContinueTrace
   * @param {string} xtrace - X-Trace ID to continue from or null
   * @param {string|function} build - name or function to return a span
   * @param {function} run - run the code. if sync, no arguments, else one
   * @param {object}  [opts] - options
   * @param {boolean} [opts.enabled=true] - enable tracing
   * @param {boolean} [opts.collectBacktraces=false] - collect backtraces
   * @param {string|function} [opts.customTxName] - name or function
   * @param {function} [callback] - Callback, if async
   *
   * @example
   * ao.startOrContinueTrace(
   *   null,
   *   'sync-span-name',
   *   functionToRun,           // synchronous so function takes no arguments
   *   {customTxName: 'special-span-name'}
   * )
   * @example
   * ao.startOrContinueTrace(
   *   null,
   *   'sync-span-name',
   *   functionToRun,
   *   // note - no context is provided for the customTxName function. If
   *   // context is required the caller should wrap the function in a closure.
   *   {customTxName: customNameFunction}
   * )
   * @example
   * // this is the function that should be instrumented
   * request('https://www.google.com', function realCallback (err, res, body) {...})
   * // because asyncFunctionToRun only accepts one parameter it must be
   * // wrapped, so the function to run becomes
   * function asyncFunctionToRun (cb) {
   *   request('https://www.google.com', cb)
   * }
   * // and realCallback is supplied as the optional callback parameter
   *
   * ao.startOrContinueTrace(
   *   null,
   *   'async-span-name',
   *   asyncFunctionToRun,     // async, so function takes one argument
   *   // no options this time
   *   realCallback            // receives request's callback arguments.
   * )
   */
  exports.startOrContinueTrace = function (xtrace, build, run, opts, cb) {
    // Verify that a run function is given
    if (typeof run !== 'function') return

    try {
      if (typeof opts !== 'object') {
        cb = opts
        opts = {enabled: true}
      } else {
        // default enabled to true if not explicitly false
        opts = Object.assign({enabled: true}, opts)
      }

      if (!cb && run.length) {
        cb = noop
      }
    } catch (e) {
      log.error('ao.startOrContinueTrace can\'t normalize arguments', e.stack)
    }

    // Verify that a builder function or span name is given
    if (!~['function', 'string'].indexOf(typeof build)) {
      return run(cb)
    }

    // If not enabled, skip
    if (!opts.enabled) {
      return run(exports.bind(cb))
    }

    // If already tracing, continue the existing trace ignoring
    // any xtrace passed as the first argument.
    const last = Span.last
    if (last) {
      return runInstrument(last, build, run, opts, cb)
    }

    //
    // this is a root span and inbound metrics should be collected.
    //
    let maker
    try {
      // Build maker
      maker = typeof build === 'function' ? build({
        descend: spanDataMaker(Span),
        profile: spanDataMaker(Profile)
      }) : {name: build, cons: Span}
    } catch (e) {
      log.error('ao.startOrContinueTrace can\'t make the span maker', e.stack)
    }

    // If no maker then maker.name is not available for the sample check (nor
    // can a span be made). There is nothing else to do.
    if (!maker) {
      return run(cb)
    }

    // Should this be sampled?
    let sample
    try {
      sample = exports.sample(maker.name, xtrace)
    } catch (e) {
      log.error('ao.startOrContinueTrace can\'t get a sample decision', e.stack)
      sample = {sample: false}
    }

    // Now actually make the span
    let span
    try {
      span = new maker.cons(maker.name, xtrace, maker.data)

      // Add sampling data to entry if there was not already an xtrace ID
      if (sample.sample && !xtrace) {
        span.events.entry.set({
          SampleSource: sample.source,
          SampleRate: sample.rate
        })
      }
    } catch (e) {
      log.error('ao.startOrContinueTrace failed to build span', e.stack)
    }

    // if not span can't do inbound metrics - need a context.
    if (!span) {
      return run(cb)
    }

    // supply a default in case the user didn't provide a txname or a
    // function to return a txname. if the span is unnamed then let oboe
    // provide "unknown"
    opts.defaultTxName = span.name ? 'custom-' + span.name : ''

    // choose right run function for sampling decison.
    const runFunction = (sample.sample ? runRootSampled : runRootUnsampled)
    return runFunction(span, run, opts, cb)
  }

  // This is a helper to map span.descend(...) and span.profile(...) calls
  // to the data provided to them, rather than producing spans or profiles
  // directly. This allows acquiring the span name before sampling, without
  // creating a span until after sampling.
  function spanDataMaker (cons) {
    return function (name, data) {
      return {name: name, data: data, cons: cons}
    }
  }

  function noop () {}
  exports.noop = noop


  /**
   * Report an error event in the current trace.
   *
   * @method ao.reportError
   * @param {Error} error - The error instance to report
   */
  exports.reportError = function (error) {
    const last = Span.last
    if (last) last.error(error)
  }


  /**
   * Report an info event in the current trace.
   *
   * @method ao.reportInfo
   * @param {object} data - Data to report in the info event
   */
  exports.reportInfo = function (data) {
    const last = Span.last
    if (last) last.info(data)
  }


  //
  // Expose lower-level components
  //
  Span = require('./span')
  Event = require('./event')
  Profile = require('./profile')
  exports.Profile = Profile
  exports.Span = Span
  exports.Event = Event


  //
  // Send __Init event
  //
  process.nextTick(function () {
    exports.requestStore.run(function () {
      const data = {
        '__Init': 1,
        'Layer': 'nodejs',
        'Label': 'single',
        'Node.Version': process.versions.node,
        'Node.V8.Version': process.versions.v8,
        'Node.LibUV.Version': process.versions.uv,
        'Node.OpenSSL.Version': process.versions.openssl,
        'Node.Ares.Version': process.versions.ares,
        'Node.ZLib.Version': process.versions.zlib,
        'Node.HTTPParser.Version': process.versions.http_parser,
        'Node.Oboe.Version': require('../package.json').version,
      }

      const base = path.join(process.cwd(), 'node_modules')
      let modules
      try {
        modules = fs.readdirSync(base)
      } catch (e) {}

      if (Array.isArray(modules)) {
        modules.forEach(mod => {
          if (mod === '.bin' || mod[0] === '@') return
          try {
            const pkg = require(`${base}/${mod}/package.json`)
            data[`Node.Module.${pkg.name}.Version`] = pkg.version
          } catch (e) {}
        })
      }
      startup = false
      log.info('making nodejs:single event')
      const md = bindings.Metadata.makeRandom(1)
      const e = new Event('nodejs', 'single', md)

      const status = e.sendStatus(data)
      if (status < 0) {
        log.error(`init.sendStatus() failed (${status})`)
      } else {
        log.status('init.sendStatus() succeeded')
      }

    })
  })

  //
  // Enable require monkey-patcher
  //
  const patcher = require('./require-patch')
  patcher.enable()

  // cache the exports in our own global so they can be reused
  // if a package like "stealthy-require" clears node's require
  // cache.
}
  global[aoOnce] = exports
}
