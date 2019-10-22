'use strict';

const path = require('path');

// this is filled in later.
const probeConfigChecks = {};

function getUnifiedConfig () {

  const errors = [];        // for each error and array of arguments for log.error()
  const warnings = [];      // ditto for log.warn()

  // location: (e)nvironment, (c)onfig, (b)oth, (o)mit - when both the env var has precedence.
  // type: (s)tring, (i)nteger, (b)oolean, object {valid: value, valid2: value}
  // name: present without APPOPTICS_ prefix if not environmentalized version of key.
  // unused: true if this should be ignored (used elsewhere, e.g., log settings)
  // deprecated: generate a warning if this item is specified.
  // map: if present use this name as property name instead of the key as the property name.
  //
  // provide a default if the setting should have a value even if not provided by the user. if
  // no default is provided the value will be undefined.
  //
  // type object/array that don't match are undefined by default.
  //

  const settings = {
    // end-user focused, config file only
    enabled: {location: 'c', type: 'b', default: true},
    ignoreConflicts: {location: 'c', type: 'b'},
    domainPrefix: {location: 'c', type: 's'},
    insertTraceIdsIntoLogs: {location: 'c', type: 'b'},
    insertTraceIdsIntoMorgan: {location: 'c', type: 'b'},
    createTraceIdsToken: {location: 'c', type: {morgan: 'morgan'}},

    // end-user focused, both env var and config file
    serviceKey: {location: 'b', type: 's'},
    hostnameAlias: {location: 'b', type: 's'},
    ec2MetadataTimeout: {location: 'b', type: 'i'},
    triggerTraceEnabled: {location: 'b', type: 'b', default: true},

    // end-user focused, env var only
    logLevel: {location: 'e', type: 'i', name: 'DEBUG_LEVEL', default: 2},
    logSettings: {location: 'e', type: 's', unused: true},
    triggerTrace: {   // maintained for compability with previous versions
      location: 'e',
      type: {enable: true, enabled: true, disable: false, disabled: false},
      default: true,
      deprecated: true,
      map: 'triggerTraceEnabled',
    },
    // end-user but unused as it is only used when configuring
    apmConfigNode: {location: 'e', type: 's', unused: true},

    // developer focused
    traceMode: {
      location: 'c',
      type: {0: 0, 1: 1, never: 0, always: 1, disabled: 0, enabled: 1},
      default: 1,
      deprecated: true,
    },
    sampleRate: {location: 'c', type: 'i', deprecated: true},
    reporter: {location: 'b', type: ['ssl', 'udp', 'file']},
    endpoint: {location: 'b', type: 's', name: 'COLLECTOR'},
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
    // it's not an error if the default filename isn't found.
    if ((e.code !== 'ENOENT' && e.code !== 'MODULE_NOT_FOUND') || configFile !== defaultConfigFile) {
      const extra = e.message ? `: ${e.message}` : '';
      errors.push(`Cannot read config file ${configFile}${extra}`);
    }
  }

  // separate the global, probes, and transaction-setting configs because the probes
  // and transaction-settings are global properties and there isn't a separate "global"
  // property. duplicate each; when a key is used it is removed from the config so when
  // done unused keys remain.
  const fileProbesConfig = Object.assign({}, fileGlobalConfig.probes);
  delete fileGlobalConfig.probes;
  const fileConfigTransactionSettings = fileGlobalConfig.transactionSettings;
  delete fileGlobalConfig.transactionSettings;

  // get the appoptics environment variables. known keys will be removed after processing so
  // those that remain are unknown.
  const aoKeys = {};
  for (const k in process.env) {
    if (k.startsWith('APPOPTICS_')) {
      aoKeys[k] = process.env[k];
    }
  }

  //
  // the return object
  //
  const results = {
    file: configFile,                   // return the resolved path
    global: {},
    unusedConfig: fileGlobalConfig,     // parts of the configuration file that weren't used
    unusedEnvVars: aoKeys,
    probes: {},
    unusedProbes: fileProbesConfig,     // probes in the configuration file that weren't used
    transactionSettings: undefined,
    settingsErrors: [],          // errors parsing/handling transactionSettings
    errors,
    warnings,
  }

  // check the keys valid for the configuration file.
  Object.keys(settings).forEach(k => {
    const setting = settings[k];
    if (setting.location === 'c' || setting.location === 'b') {
      if (k in fileGlobalConfig) {
        const value = convert(fileGlobalConfig[k], setting.type);
        // if it's undefined it's an error unless the original value was undefined. the
        // user may have set the key to undefined as a way of disabling it.
        if (value !== undefined) {
          results.global[k] = value;
        } else if (fileGlobalConfig[k] !== undefined) {
          warnings.push(`invalid configuration file value ${k}: ${fileGlobalConfig[k]}`);
        }
        if (setting.deprecated) {
          warnings.push(`${k} is deprecated; it will be invalid in the future`);
        }
        // remove the value because the key is valid even if the value wasn't.
        delete fileGlobalConfig[k];
      } else if ('default' in setting) {
        results.global[k] = setting.default;
      }
    }
  })

  // check the keys valid as environment variables.
  Object.keys(settings).forEach(k => {
    const setting = settings[k];
    if (setting.location !== 'e' && setting.location !== 'b') {
      return;
    }
    const envVar = `APPOPTICS_${setting.name || envForm(k)}`;
    if (envVar in aoKeys) {
      if (setting.unused) {
        delete aoKeys[envVar];
        return;
      }
      const value = convert(aoKeys[envVar], setting.type);
      if (value !== undefined) {
        results.global[setting.map || k] = value;
      } else {
        warnings.push(`invalid environment variable value ${envVar}=${aoKeys[envVar]}`);
      }
      if (setting.deprecated) {
        warnings.push(`${envVar} is deprecated; it will be invalid in the future`);
      }
      // remove this key because the env var is valid even if the value wasn't.
      delete aoKeys[envVar];
    } else if ('default' in setting && setting.location === 'e') {
      // if this is also a config file option it will be set (either a value or a
      // default value) so a default only should be set if this can only be an env
      // var.
      results.global[setting.map || k] = setting.default;
    }
  })


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
    // if there is a check for this probe's config then use it.
    if (probeConfigChecks[mod]) {
      const probeResults = probeConfigChecks[mod](results.probes[mod]);
      results.probes[mod] = probeResults.validConfig;
      if (probeResults.errors) {
        probeResults.errors.forEach(e => errors.push(e));
      }
      if (probeResults.warnings) {
        probeResults.warnings.forEach(w => {warnings.push(w)});
      }
    }
    delete fileProbesConfig[mod];
  })

  // handle excluded urls separately. the form is an array of
  // objects, each of the form:
  //   {type: url, <type-specific-values>}
  //   {type: url, string|regex: pattern, tracing: enabled|disabled}
  const {transactionSettings, settingsErrors} = parsetransactionSettings(
    fileConfigTransactionSettings
  );
  results.transactionSettings = transactionSettings;
  results.settingsErrors = settingsErrors;

  // convert object leftovers to arrays of text key-value representations.
  const toBeFixedUp = ['unusedConfig', 'unusedEnvVars', 'unusedProbes'];
  for (let i = 0; i < toBeFixedUp.length; i++) {
    const a = [];
    const keys = Object.keys(results[toBeFixedUp[i]]);
    for (let j = 0; j < keys.length; j++) {
      if (toBeFixedUp[i] === 'unusedProbes') {
        a.push({[keys[j]]: results[toBeFixedUp[i]][keys[j]]});
      } else {
        const divider = toBeFixedUp[i] === 'unusedEnvVars' ? '=' : ': ';
        a.push(`${keys[j]}${divider}${results[toBeFixedUp[i]][keys[j]]}`);
      }
    }
    results[toBeFixedUp[i]] = a;
  }

  return results;
}

//====================================
// probe configuration check functions
//====================================

probeConfigChecks.fs = function (cfg) {
  const errors = [];
  const warnings = [];
  const validConfig = Object.assign({}, cfg);

  // could do more validation but the checking function uses `e.code in conf.ignoreErrors` to
  // make the ignore decision. so just make sure it's a object so `in` can be used.
  if (cfg.ignoreErrors && typeof cfg.ignoreErrors !== 'object') {
    errors.push(`invalid ignoreErrors setting: ${JSON.stringify(cfg.ignoreErrors)}`)
    delete validConfig.ignoreErrors;
  }

  return {validConfig, errors, warnings};
}

//================================================================
// utility functions
//================================================================
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

function envForm (s) {
  return s.replace(/([A-Z])/g, $1 => {
    return '_' + $1;
  }).toUpperCase()
}

//
// function to parse the transactionSettings patterns.
//
function parsetransactionSettings (settings) {
  const goodSettings = []
  const errors = []

  const results = {transactionSettings: undefined, settingsErrors: errors}

  if (!settings) {
    return results
  }

  if (!Array.isArray(settings)) settings = [settings]

  settings.forEach(setting => {
    // presume success of one form or another
    const goodEntry = {type: 'url', pattern: undefined, doSample: false, doMetrics: false}

    if (setting.type !== 'url') {
      errors.push({spec: setting, error: `invalid type: "${setting.type}"`})
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

  return results
}

module.exports = getUnifiedConfig;

if (!module.parent) {
  // eslint-disable-next-line no-console
  console.log(getUnifiedConfig());
}
