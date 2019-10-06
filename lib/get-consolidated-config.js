'use strict';



// only these non-probe defaults are taken from the config file. because
// probes have a variety of probe-dependent options those are not restricted
// in the same way.
const defaults = {
  global: {
    //enabled: true,
    //hostnameAlias: undefined,
    //traceMode: undefined,
    //sampleRate: undefined,
    //serviceKey: undefined,
    //ignoreConflicts: false,
    //domainPrefix: false,
    //triggerTraceEnabled: true,
    //ec2MetadataTimeout: undefined,      // ms to wait for ec2 metadata reply
    //insertTraceIdsIntoLogs: false,
    //insertTraceIdsIntoMorgan: false,    // separate setting because this mucks with log formats directly
    //createTraceIdsToken: false,         // 'morgan' to create for morgan. no others supported yet, nor multiple.
  }
}

const errors = [];        // for each error and array of arguments for log.error()
const warnings = [];      // ditto for log.warn()

// location: (e)nvironment, (c)onfig, (b)oth, (o)mit - when both the env var has precedence.
// type: (s)tring, (i)nteger, (b)oolean, object {valid: value, valid2: value}
// name: present without APPOPTICS_ prefix if not environmentalized version of key.
// unused: true if this should be ignored (used elsewhere, e.g., log settings)
//
// type object/array that don't match are undefined by default.

const settings = {
  // end-user focused, config file only
  enabled: {location: 'c', type: 'b', default: true},
  ignoreConflicts: {location: 'c', type: 'b'},
  domainPrefix: {location: 'c', type: 'b'},
  insertTraceIdsIntoLogs: {location: 'c', type: 'b'},
  insertTraceIdsIntoMorgan: {location: 'c', type: 'b'},
  createTraceIdsToken: {location: 'c', type: {morgan: 'morgan'}},

  // end-user focused, both env var and config file
  serviceKey: {location: 'b', type: 's'},
  hostnameAlias: {location: 'b', type: 's'},
  ec2MetadataTimeout: {location: 'b', type: 'i'},
  triggerTrace: {location: 'b', type: {enable: true, disable: false}, default: true},

  // end-user focused, env var only
  logLevel: {location: 'e', type: 'i', name: 'DEBUG_LEVEL', default: 2},
  logSettings: {location: 'e', type: 's', unused: true},

  // developer focused
  traceMode: {
    location: 'c',
    type: {0: 0, 1: 1, never: 0, always: 1, disabled: 0, enabled: 1, undefined: 1},
    default: 1,
    deprecated: true,
  },
  sampleRate: {location: 'c', type: 'i', deprecated: true},
  reporter: {location: 'b', type: ['ssl', 'udp', 'file']},
  collector: {location: 'b', type: 's'},
  trustedPath: {location: 'b', type: 's'},

  // not currently used by the node agent
  tokenBucketCapacity: {location: 'o', type: 'i'},
  tokenBucketRate: {location: 'o', type: 'i'},
  bufferSize: {location: 'o', type: 'i', name: 'BUFSIZE'},
  logFilePath: {location: 'o', type: 's', name: 'LOGNAME'},
  traceMetrics: {location: 'o', type: 'b'},
  histogramPrecision: {location: 'o', type: 'i'},
  maxTransactions: {location: 'o', type: 'i'},
  flushMaxWaitTime: {location: 'o', type: 'i'},
  eventsFlushInterval: {location: 'o', type: 'i'},
  eventsFlushBatchSize: {location: 'o', type: 'i'},
  oneFilePerEvent: {location: 'o', type: 'b', name: 'REPORTER_FILE_SINGLE'},
}

//
// require the config file first. there are two parts: the "global" config which
// comprises all keys at the top level *except* for "probes" and the "probes"
// config which is all keys under the "probes" key.
//
// no extension is specified so that it can be a .json file or a .js module.
//
const defaultConfigFile = path.join(process.cwd(), 'appoptics-apm')
let configFile = defaultConfigFile
if (process.env.APPOPTICS_APM_CONFIG_NODE) {
  configFile = path.resolve(process.env.APPOPTICS_APM_CONFIG_NODE);
}

let fileGlobalConfig = {};
try {
  fileGlobalConfig = require(configFile);
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND' || configFile !== defaultConfigFile) {
    errors.push(['Cannot read config file %s', configFile, e.code]);
  }
}

// separate the global, probes, and transaction-setting configs because the probes
// and transaction-settings are global properties and there isn't a separate "global"
// property. duplicate each; when a key is used it is removed from the config so when
// done unused keys remain.
const fileProbesConfig = Object.assign({}, fileGlobalConfig.probes);
delete fileGlobalConfig.probes;
const fileConfigTransactionSettings = Object.assign({}, fileGlobalConfig.transactionSettings);
delete fileGlobalConfig.transactionSettings;


//
// the return object
//
const results = {
  file: configFile,                  // return the resolved path
  global: {},
  probes: {},
  transactionSettings: undefined,
  unusedConfig: fileGlobalConfig,    // parts of the configuration file that weren't used
  unusedProbes: fileProbesConfig,    // probes in the configuration file that weren't used
  errors,
  warnings,
  settingsErrors: undefined,  // errors parsing/handling transactionSettings
}

// check the keys valid for the configuration file.
Object.keys(settings).forEach(k => {
  const setting = settings[k];
  if (setting.location === 'c' || setting.location === 'b') {
    if (k in fileGlobalConfig) {
      results.global[k] = convert(fileGlobalConfig[k], setting.type);
      // if it's undefined it's an error unless the original value was undefined. the
      // user may have set undefined so it wouldn't have a value.
      if (results.global[k] === undefined && fileGlobalConfig[k] !== undefined) {
        warnings.push([`invalid configuration file value ${k}: ${fileGlobalConfig[k]}`]);
      }
      if (setting.deprecated) {
        warnings.push(`${setting.name} is deprecated; it will be invalid in the future`);
      }
      // remove the value because the key is valid even if the value wasn't.
      delete fileGlobalConfig[k];
    } else if ('default' in setting) {
      results.global[k] = setting.default;
    }
  }
})


function convert (value, type) {
  if (type === 's') {
    return `${value}`;
  }
  if (type === 'i') {
    if (typeof value === 'string') {
      value = +value;
    }
    return Number.isNaN(value) ? undefined : value;
  }
  if (type === 'b') {
    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'on', 'y'].indexOf(value.toLowerCase()) >= 0;
    }
    return !!value;
  }
  if (Array.isArray(type)) {
    return type.indexOf(value) >= 0 ? value : undefined;
  }
  if (typeof type === 'object' && value.toLowerCase() in type) {
    return type[value.toLowerCase()];
  }
  return undefined;
}

const keyMap = {
  // these have been documented for end-users; the names should not be changed
  //SERVICE_KEY: {name: 'serviceKey', type: 's'},
  //TRUSTEDPATH: {name: 'trustedPath', type: 's'},
  //HOSTNAME_ALIAS: {name: 'hostnameAlias', type: 's'},
  //DEBUG_LEVEL: {name: 'logLevel', type: 'i'},
  //LOG_SETTINGS: {name: 'logSettings', type: 's', unused: true},      // here only so it won't show up as invalid.

  // feel free to rationalize the following

  // used by node agent
  //REPORTER: {name: 'reporter', type: 's'},
  //COLLECTOR: {name: 'endpoint', type: 's'},
  // /TOKEN_BUCKET_CAPACITY: {name: 'tokenBucketCapacity', type: 'i'},   // file and udp reporter (deprecated)
  //TOKEN_BUCKET_RATE: {name: 'tokenBucketRate', type: 'i'},           // file and udp reporter (deprecated)

  // not used by node agent
  //BUFSIZE: {name: 'bufferSize', type: 'i'},
  //LOGNAME: {name: 'logFilePath', type: 's'},
  //TRACE_METRICS: {name: 'traceMetrics', type: 'b'},
  //HISTOGRAM_PRECISION: {name: 'histogramPrecision', type: 'i'},
  //MAX_TRANSACTIONS: {name: 'maxTransactions', type: 'i'},
  //FLUSH_MAX_WAIT_TIME: {name: 'flushMaxWaitTime', type: 'i'},
  //EVENTS_FLUSH_INTERVAL: {name: 'eventsFlushInterval', type: 'i'},
  //EVENTS_FLUSH_BATCH_SIZE: {name: 'eventsFlushBatchSize', type: 'i'},
  //REPORTER_FILE_SINGLE: {name: 'oneFilePerEvent', type: 'b'},           // file reporter

  // not yet documented - enabled in config file
  //EC2_METADATA_TIMEOUT: {name: 'ec2MetadataTimeout', type: 'i'},
  //TRIGGER_TRACE: {name: 'triggerTrace', type: {enable: 1, disable: 0}},
}

// now get the probe defaults
let probeDefaults;
try {
  probeDefaults = require('./probe-defaults');
} catch (e) {
  errors.push(['Cannot read probe defaults "./probe-defaults"', e]);
}

// the keys across different probe types are different enough that it would
// require implementing defaults for each probe. if there becomes an obvious
// need to check them in the future that will be the time to implement.
// only consider known probes
// TODO BAM should this be driven from defaults? if so, maybe release check needs to verify
// that probe-defaults matches valid probes in lib/probes/.
Object.keys(probeDefaults).forEach(mod => {
  results.probes[mod] = Object.assign({}, probeDefaults[mod], fileProbesConfig[mod]);
  delete fileProbesConfig[mod];
})

// get the probes and special URLs before resetting config
//ao.probes = config.probes
//ao.specialUrls = config.transactionSettings && config.transactionSettings.filter(s => s.type === 'url');
//ao.cfg = Object.assign({}, config = config.global);
//

module.exports = {results};

return;

// fix up options with embedded dashes
const keys = Object.keys(cliOptions).filter(k => k.match(/[^-]+-[^-]+/));
for (const k of keys) {
  cliOptions[toCamel(k)] = cliOptions[k];
  delete cliOptions[k];
}

const toCamel = s => {
  return s.replace(/([-][a-z])/ig, $1 => {
    return $1.toUpperCase()
      .replace('-', '');
  });
};

const envform = s => {
  return s.replace(/([A-Z])/g, $1 => {
    return '_' + $1;
  }).toUpperCase()
}

//function parseConfig (fileConfig, defaults = {}) {
//  fileConfig = Object.assign({}, fileConfig)
//  const globalDefaults = Object.assign({}, defaults.global)
//  const probeDefaults = Object.assign({}, defaults.probes)
//
//  const results = {
//    file: fileConfig,           // echo fileConfig
//    global: undefined,
//    probes: undefined,
//    transactionSettings: undefined,
//    unusedConfig: undefined,    // parts of the configuration file that weren't used
//    unusedProbes: undefined,    // probes in the configuration file that weren't used
//    settingsErrors: undefined,  // errors parsing/handling transactionSettings
//  }
//
//  // duplicate the keys so keys can be removed as they are used, leaving unused keys.
//  results.file = Object.assign({}, fileConfig)
//
//  // make sure it has a probes object. duplicate the keys so that removing
//  // them as they are used is not a destructive action to the arguments passed in.
//  fileConfig.probes = Object.assign({}, fileConfig.probes)
//
//  const config = {}
//  // only consider expected keys
//  for (const key of Object.keys(globalDefaults)) {
//    config[key] = key in fileConfig ? fileConfig[key] : globalDefaults[key]
//    delete fileConfig[key]
//  }
//  results.global = config
//
//  // handle probes separately. the keys across different probe types are
//  // different enough that it would require implementing a type for each
//  // probe. if there becomes an obvious need to check them in the future
//  // that will be the time to implement.
//  const probes = {}
//
//  // only consider known probes
//  Object.keys(probeDefaults).forEach(mod => {
//    probes[mod] = Object.assign({}, probeDefaults[mod])
//    Object.assign(probes[mod], fileConfig.probes[mod] || {})
//    delete fileConfig.probes[mod]
//  })
//  results.probes = probes
//
//  // handle excluded urls separately. the form is an array of
//  // objects, each of the form:
//  //   {type: url, <type-specific-values>}
//  //   {type: url, string|regex: pattern, tracing: enabled|disabled}
//  const {transactionSettings, settingsErrors} = parsetransactionSettings(
//    fileConfig.transactionSettings
//  )
//  results.transactionSettings = transactionSettings
//  results.settingsErrors = settingsErrors
//
//
//  // now report any unused probes
//  let unused = Object.keys(fileConfig.probes)
//  if (unused.length) {
//    results.unusedProbes = unused
//  }
//  // report any key other than probes and transactionSettings as unused
//  delete fileConfig.probes
//  delete fileConfig.transactionSettings
//  unused = Object.keys(fileConfig)
//  if (unused.length) {
//    results.unusedConfig = unused
//  }
//
//  return results
//}

//
// function to parse the transactionSettings patterns.
//
function parsetransactionSettings (settings) {
  const goodSettings = []
  const errors = []

  const results = {transactionSettings: undefined, settingsErrors: undefined}

  if (!settings) {
    return results
  }

  if (!Array.isArray(settings)) settings = [settings]

  settings.forEach(setting => {
    // presume success of one form or another
    const goodEntry = {type: 'url', pattern: undefined, doSample: false, doMetrics: false}

    if (setting.type !== 'url') {
      errors.push({spec: setting, error: `invalid type: "${setting.url}"`})
      return
    }

    if (!('string' in setting ^ 'regex' in setting)) {
      errors.push({spec: setting, error: 'must specify one, not both, of "string" and "regex"'})
      return
    }

    if (setting.tracing !== 'disabled' && setting.tracing !== 'enabled') {
      errors.push({spec: setting, error: `invalid tracing value: "${setting.tracing}"`})
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
      goodEntry.pattern = setting.regex
      goodSettings.push(goodEntry)
    } else if (typeof setting.regex === 'string') {
      let re
      try {
        re = new RegExp(setting.regex)
        goodEntry.pattern = re
      } catch (e) {
        errors.push({spec: setting, error: e.message})
      }
      if (re) {
        goodSettings.push(goodEntry)
      }
    } else if (setting.string && typeof setting.string === 'string') {
      goodEntry.pattern = setting.string
      goodSettings.push(goodEntry)
    } else {
      errors.push({spec: setting, error: 'invalid specialUrl'})
    }
  })

  // goodSettings will look like {type, url, doSample, doMetrics}
  if (goodSettings.length) results.transactionSettings = goodSettings
  if (errors.length) results.settingsErrors = errors

  return results
}
