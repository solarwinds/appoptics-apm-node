'use strict'

const path = require('path')

// this is filled in later.
const probeConfigChecks = {}

function getUnifiedConfig () {
  const execEnv = getExecutionEnvironment()

  const fatals = [] // fatal errors - the agent must be disabled.
  const errors = [] // for each error an array of strings for log.error()
  const warnings = [] // ditto for log.warn()
  const debuggings = [] // ditto for log.debug()

  const serverless = () => execEnv.type === 'serverless' || undefined
  const inLambda = () => execEnv.id === 'lambda'

  //
  // location: (e)nvironment, (c)onfig, (b)oth, (o)mit - when both the env var has precedence.
  // type: (s)tring, (i)nteger, (f)loat, (b)oolean, object {valid: value, valid2: value}
  // name: present without SW_APM_ prefix if not environmentalized version of key.
  // ignore: true if this should be ignored (used elsewhere, e.g., log settings)
  // deprecated: generate a warning if this item is specified.
  // map: if present use this name as property name instead of the key as the property name.
  // eeid: if present the execEnv.id must match this value else treated as location: (o)mit.
  //
  // provide a default if the setting should have a value even if not provided by the user. if
  // no default is provided the value will be undefined.
  //
  // type object/array that don't match are undefined by default.
  //

  const settings = {
    // end-user focused, config file only
    domainPrefix: { location: 'c', type: 'b' },
    insertTraceIdsIntoLogs: { location: 'c', type: 'b' },

    // end-user focused, both env var and config file
    enabled: { location: 'b', type: 'b', default: true },
    serviceKey: { location: 'b', type: 's', default: '' },
    hostnameAlias: { location: 'b', type: 's', ignore: inLambda },
    ec2MetadataTimeout: { location: 'b', type: 'i', ignore: inLambda },
    triggerTraceEnabled: { location: 'b', type: 'b', default: true },
    runtimeMetrics: { location: 'b', type: 'b', default: true },
    proxy: { location: 'b', type: 's', ignore: inLambda },

    // this is used only in a lambda environment. if not it's a noop.
    sampleRate: { location: 'b', type: 'i', default: serverless() && 1000000 },
    samplePercent: { location: 'b', type: 'f' },

    // end-user focused, env var only
    logLevel: { location: 'e', type: 'i', name: 'DEBUG_LEVEL', default: 2 },
    logSettings: { location: 'e', type: 's', ignore: true }, // ignore - used setting up loggers
    // only used in a lambda environment
    wrapLambdaHandler: { location: 'e', type: 's', eeid: 'lambda' },
    tokenBucketCapacity: { location: 'e', type: 'i', eeid: 'lambda' },
    tokenBucketRate: { location: 'e', type: 'i', eeid: 'lambda' },
    transactionName: { location: 'e', type: 's', eeid: 'lambda' },
    stdoutClearNonblocking: { location: 'e', type: 'i', eeid: 'lambda', default: 1 },
    // end-user but ignore as it is only used when configuring
    configNode: { location: 'e', type: 's', ignore: true }, // ignore - used to load config file

    // developer focused
    traceMode: {
      location: 'c',
      type: { 0: 0, 1: 1, never: 0, always: 1, disabled: 0, enabled: 1 },
      default: 1,
      deprecated: true
    },
    reporter: { location: 'b', type: ['ssl', 'udp', 'file'] },
    endpoint: { location: 'b', type: 's', name: 'COLLECTOR' },
    trustedPath: { location: 'b', type: 's', name: 'TRUSTEDPATH' },
    unifiedLogging: {
      location: 'b',
      type: ['always', 'never', 'preferred'],
      default: 'preferred'
    },
    // not currently used by the node agent
    bufferSize: { location: 'o', type: 'i', name: 'BUFSIZE' },
    logFilePath: { location: 'o', type: 's', name: 'LOGNAME' },
    traceMetrics: { location: 'o', type: 'b' },
    histogramPrecision: { location: 'o', type: 'i' },
    maxTransactions: { location: 'o', type: 'i' },
    flushMaxWaitTime: { location: 'o', type: 'i' },
    eventsFlushInterval: { location: 'o', type: 'i' },
    eventsFlushBatchSize: { location: 'o', type: 'i' },
    oneFilePerEvent: { location: 'o', type: 'b', name: 'REPORTER_FILE_SINGLE' }
  }

  //
  // require the config file first. there are two parts: the "global" config which
  // comprises all keys at the top level *except* for "probes" and the "probes"
  // config which is all keys under the "probes" key.
  //
  // no extension is specified so that it can be a .json file or a .js module.
  //
  const defaultConfigFile = path.join(process.cwd(), 'solarwinds-apm-config')
  let configFile = defaultConfigFile
  if (process.env.SW_APM_CONFIG_NODE) {
    configFile = path.resolve(process.env.SW_APM_CONFIG_NODE)
  }

  let fileGlobalConfig = {}
  try {
    fileGlobalConfig = require(configFile)
    debuggings.push(`read config from ${configFile}`)
  } catch (e) {
    // it's not an error if the default filename isn't found.
    if ((e.code !== 'ENOENT' && e.code !== 'MODULE_NOT_FOUND') || configFile !== defaultConfigFile) {
      // node 12 changed the error format to include the stack in the message. splitting the message on
      // that string is ugly but effective.
      const extra = e.message ? `: ${e.message.split('\nRequire stack')[0]}` : ''
      errors.push(`Cannot read config file ${configFile}${extra}`)
    }
  }

  // separate the global, probes, and transaction-setting configs because the probes
  // and transaction-settings are global properties and there isn't a separate "global"
  // property. duplicate each; when a key is used it is removed from the config so when
  // done unused keys remain.
  const fileProbesConfig = Object.assign({}, fileGlobalConfig.probes)
  delete fileGlobalConfig.probes
  const fileConfigTransactionSettings = fileGlobalConfig.transactionSettings
  delete fileGlobalConfig.transactionSettings

  // get the appoptics environment variables. known keys will be removed after processing so
  // those that remain are unknown.
  const aoKeys = {}
  for (const k in process.env) {
    if (k.startsWith('SW_APM_')) {
      aoKeys[k] = process.env[k]
    }
  }

  //
  // the return object
  //
  const results = {
    execEnv,
    file: configFile, // return the resolved path
    global: {},
    unusedConfig: fileGlobalConfig, // parts of the configuration file that weren't used
    unusedEnvVars: aoKeys,
    probes: {},
    unusedProbes: fileProbesConfig, // probes in the configuration file that weren't used
    transactionSettings: undefined,
    settingsErrors: [], // errors parsing/handling transactionSettings
    fatals,
    errors,
    warnings,
    debuggings
  }

  // check the keys valid for the configuration file.
  Object.keys(settings).forEach(k => {
    const setting = settings[k]

    // avoid an extra iteration by setting all defaults up front
    if ('default' in setting && setting.default !== undefined) {
      if (!setting.eeid || setting.eeid === execEnv.id) {
        results.global[setting.map || k] = setting.default
      }
    }

    if (setting.location === 'c' || setting.location === 'b') {
      if (k in fileGlobalConfig) {
        const value = convert(fileGlobalConfig[k], setting.type)
        // if it's undefined it's an error unless the original value was undefined. the
        // user may have set the key to undefined as a way of disabling it.
        if (value !== undefined) {
          results.global[k] = value
        } else if (fileGlobalConfig[k] !== undefined) {
          warnings.push(`invalid configuration file value ${k}: ${fileGlobalConfig[k]}`)
        }
        if (setting.deprecated) {
          warnings.push(`${k} is deprecated; it will be invalid in the future`)
        }
        // remove the value because the key is valid even if the value wasn't.
        delete fileGlobalConfig[k]
      }
    }
  })

  // check the keys valid as environment variables.
  Object.keys(settings).forEach(k => {
    const setting = settings[k]
    if (setting.location !== 'e' && setting.location !== 'b') {
      return
    }

    const envVar = `SW_APM_${setting.name || envForm(k)}`

    // if the environment variable exists, honor it if possible. if it doesn't
    // exist see if a default exists for the setting.
    if (envVar in aoKeys) {
      // if the setting is restricted to a specific execution environment
      // then skip it if wrong environment.
      if (setting.eeid && setting.eeid !== execEnv.id) {
        debuggings.push(`omitting ${k}: eeid: ${setting.eeid} !== ${execEnv.id}`)
        return
      }
      if (setting.ignore) {
        if (typeof setting.ignore !== 'function' || setting.ignore()) {
          debuggings.push(`guc ignoring ${envVar}`)
          delete aoKeys[envVar]
          return
        }
      }
      const value = convert(aoKeys[envVar], setting.type)
      if (value !== undefined) {
        results.global[setting.map || k] = value
      } else {
        warnings.push(`invalid environment variable value ${envVar}=${aoKeys[envVar]}`)
      }
      if (setting.deprecated) {
        warnings.push(`${envVar} is deprecated; it will be invalid in the future`)
      }
      // remove this key because the env var is valid even if the value wasn't.
      delete aoKeys[envVar]
    }
  })

  //
  // now validate the serviceKey.
  //
  if (execEnv.type === 'serverless' && execEnv.id === 'lambda') {
    if (!results.global.serviceKey) {
      delete results.global.serviceKey
    }
  } else {
    // there must be a valid service key
    const serviceKey = results.global.serviceKey
    const keyParts = serviceKey.split(':')
    const key = keyParts.shift()
    const name = keyParts.join(':')
    const cleansedKey = `${key}:${cleanseServiceName(name)}`
    if (!validKey(cleansedKey)) {
      fatals.push(`not a valid serviceKey: ${serviceKey}`)
      results.global.serviceKey = ''
    } else if (cleansedKey !== serviceKey) {
      // the cleansed key is valid but the original key was not
      warnings.push(`serviceKey specified: "${mask(serviceKey)}" converted to: "${mask(cleansedKey)}"`)
      results.global.serviceKey = cleansedKey
    } else {
      debuggings.push(`serviceKey ${mask(serviceKey)}`)
    }
  }

  //
  // cleanup samplePercent (new) and sampleRate (old). because samplePercent is newer it will
  // take priority over sampleRate if both are present. but the config will only have one value:
  // sampleRate.
  //
  if (results.global.samplePercent) {
    results.global.sampleRate = Math.round(results.global.samplePercent * 10000)
    delete results.global.samplePercent
  }

  //
  // now get the probe defaults
  //
  let probeDefaults
  try {
    probeDefaults = require('./probe-defaults')
  } catch (e) {
    errors.push(['Cannot read probe defaults "./probe-defaults"', e])
  }

  // the keys across different probe types are different enough that it would
  // require implementing defaults for each probe. if there becomes an obvious
  // need to check them in the future that will be the time to implement.
  // only consider known probes
  Object.keys(probeDefaults).forEach(mod => {
    results.probes[mod] = Object.assign({}, probeDefaults[mod], fileProbesConfig[mod])
    // if there is a check for this probe's config then use it.
    if (probeConfigChecks[mod]) {
      const probeResults = probeConfigChecks[mod](results.probes[mod])
      results.probes[mod] = probeResults.validConfig
      if (probeResults.errors) {
        probeResults.errors.forEach(e => errors.push(e))
      }
      if (probeResults.warnings) {
        probeResults.warnings.forEach(w => { warnings.push(w) })
      }
    }
    delete fileProbesConfig[mod]
  })

  //
  // now get transaction settings
  //

  // handle excluded urls separately. the form is an array of
  // objects, each of the form:
  //   {type: url, <type-specific-values>}
  //   {type: url, string|regex: pattern, tracing: enabled|disabled}
  const { transactionSettings, settingsErrors } = parsetransactionSettings(
    fileConfigTransactionSettings
  )
  results.transactionSettings = transactionSettings
  results.settingsErrors = settingsErrors

  // convert object leftovers to arrays of text key-value representations.
  const toBeFixedUp = ['unusedConfig', 'unusedEnvVars', 'unusedProbes']
  for (let i = 0; i < toBeFixedUp.length; i++) {
    const a = []
    const keys = Object.keys(results[toBeFixedUp[i]])
    for (let j = 0; j < keys.length; j++) {
      if (toBeFixedUp[i] === 'unusedProbes') {
        a.push({ [keys[j]]: results[toBeFixedUp[i]][keys[j]] })
      } else {
        const divider = toBeFixedUp[i] === 'unusedEnvVars' ? '=' : ': '
        a.push(`${keys[j]}${divider}${results[toBeFixedUp[i]][keys[j]]}`)
      }
    }
    results[toBeFixedUp[i]] = a
  }

  return results
}

//= ===================================
// determine the execution environment
//= ===================================
function getExecutionEnvironment () {
  const env = process.env

  const nodeEnv = env.NODE_ENV ? env.NODE_ENV.toLowerCase() : 'development'

  if ('AWS_LAMBDA_FUNCTION_NAME' in env && 'LAMBDA_TASK_ROOT' in env) {
    return { type: 'serverless', id: 'lambda', nodeEnv }
  }

  // if the linux id is needed start using linux-os-info
  return { type: 'linux', id: undefined, nodeEnv }
}

//= ===================================
// probe configuration check functions
//= ===================================

probeConfigChecks.fs = function (cfg) {
  const errors = []
  const warnings = []
  const validConfig = Object.assign({}, cfg)
  const validErrorObjects = {}

  // could do more validation but the goal here is to make sure the checking function can use
  // `in` on both levels of the ignoreErrors object. the checks it makes are:
  //   `conf.ignoreErrors && method in conf.ignoreErrors`
  // followed by:
  //   `err.code in conf.ignoreErrors[method]`
  if (cfg.ignoreErrors && typeof cfg.ignoreErrors !== 'object') {
    errors.push(`invalid ignoreErrors setting: ${JSON.stringify(cfg.ignoreErrors)}`)
    delete validConfig.ignoreErrors
  }
  // e2i - error to ignore
  for (const e2i in validConfig.ignoreErrors) {
    if (typeof validConfig.ignoreErrors[e2i] === 'object') {
      validErrorObjects[e2i] = validConfig.ignoreErrors[e2i]
    } else {
      const etext = JSON.stringify({ [e2i]: validConfig.ignoreErrors[e2i] })
      errors.push(`invalid error code to ignore: ${etext}`)
    }
  }
  if (cfg.ignoreErrors && validConfig.ignoreErrors) {
    validConfig.ignoreErrors = validErrorObjects
  }

  return { validConfig, errors, warnings }
}

//= ===============================================================
// utility functions
//= ===============================================================
function convert (value, type) {
  if (type === 's') {
    return `${value}`
  }
  if (type === 'i' || type === 'f') {
    if (typeof value === 'string') {
      value = +value
    }
    if (type === 'i') value = Math.round(value)
    return Number.isNaN(value) ? undefined : value
  }
  if (type === 'b') {
    if (typeof value === 'string') {
      return ['1', 'true', 't', 'yes', 'y', 'on'].indexOf(value.toLowerCase()) >= 0
    }
    return !!value
  }
  if (Array.isArray(type)) {
    return type.indexOf(value) >= 0 ? value : undefined
  }
  if (typeof type === 'object') {
    if (value in type) {
      return type[value]
    } else if (typeof value === 'string' && value.toLowerCase() in type) {
      return type[value.toLowerCase()]
    }
  }
  if (typeof type === 'function') {
    return type(value)
  }
  return undefined
}

function envForm (s) {
  return s.replace(/([A-Z])/g, $1 => {
    return '_' + $1
  }).toUpperCase()
}

function validKey (key) {
  return !!key.match(/^([A-Fa-f0-9]{64}|[A-Za-z0-9_-]{71}):[A-Za-z0-9.:_-]{1,255}$/)
}

function cleanseServiceName (serviceName) {
  // replace blanks with dashes then remove other illegal characters
  return serviceName.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9.:_-]/g, '')
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
// function to parse the transactionSettings patterns.
//
function parsetransactionSettings (settings) {
  const goodSettings = []
  const errors = []

  const results = { transactionSettings: undefined, settingsErrors: errors }

  if (!settings) {
    return results
  }

  if (!Array.isArray(settings)) settings = [settings]

  settings.forEach(setting => {
    // presume success of one form or another
    const goodEntry = { type: 'url', regex: undefined, string: undefined, doSample: false, doMetrics: false }

    if (setting.type !== 'url') {
      errors.push({ spec: setting, error: `invalid type: "${setting.type}"` })
      return
    }

    if (!('string' in setting ^ 'regex' in setting)) {
      errors.push({ spec: setting, error: 'must specify one, not both, of "string" and "regex"' })
      return
    }

    if (setting.tracing !== 'disabled' && setting.tracing !== 'enabled') {
      errors.push({ spec: setting, error: `invalid tracing value: "${setting.tracing}"` })
      return
    }

    // set to true if the user, for some reason, has an entry with tracing === 'enabled'
    if (setting.tracing === 'enabled') {
      goodEntry.doSample = goodEntry.doMetrics = true
    }

    // now check the specified URL pattern. handle both RegExp and strings
    // because the config file can be JSON or a module. JSON cannot have a
    // RegExp value but a module can.
    if (setting.regex instanceof RegExp) {
      goodEntry.regex = setting.regex
      goodSettings.push(goodEntry)
    } else if (typeof setting.regex === 'string') {
      let re
      try {
        re = new RegExp(setting.regex)
        goodEntry.regex = re
      } catch (e) {
        errors.push({ spec: setting, error: e.message })
      }
      if (re) {
        goodSettings.push(goodEntry)
      }
    } else if (setting.string && typeof setting.string === 'string') {
      goodEntry.string = setting.string
      goodSettings.push(goodEntry)
    } else {
      errors.push({ spec: setting, error: 'invalid specialUrl' })
    }
  })

  // goodSettings will look like {type, url, doSample, doMetrics}
  if (goodSettings.length) results.transactionSettings = goodSettings

  return results
}

module.exports = getUnifiedConfig

if (!module.parent) {
  // eslint-disable-next-line no-console
  console.log(getUnifiedConfig())
}
