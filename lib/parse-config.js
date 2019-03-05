'use strict'

//
// parse the user's file configuration using probe defaults.
//
// fileConfig - the configuration object from the user's configuration file
// probeDefaults - the default values to use for the probes.
//
module.exports = function parseConfig (fileConfig, defaults = {}) {
  fileConfig = Object.assign({}, fileConfig)
  const globalDefaults = Object.assign({}, defaults.global)
  const probeDefaults = Object.assign({}, defaults.probes)

  const results = {
    file: fileConfig,           // echo fileConfig
    global: undefined,
    probes: undefined,
    transactionSettings: undefined,
    unusedConfig: undefined,    // parts of the configuration file that weren't used
    unusedProbes: undefined,    // probes in the configuration file that weren't used
    settingsErrors: undefined,  // errors parsing/handling transactionSettings
  }

  // duplicate the keys so keys can be removed as they are used, leaving unused keys.
  results.file = Object.assign({}, fileConfig)

  // make sure it has a probes object. duplicate the keys so that removing
  // them as they are used is not a destructive action to the arguments passed in.
  fileConfig.probes = Object.assign({}, fileConfig.probes)

  const config = {}
  // only consider expected keys
  for (const key of Object.keys(globalDefaults)) {
    config[key] = key in fileConfig ? fileConfig[key] : globalDefaults[key]
    delete fileConfig[key]
  }
  results.global = config

  // handle probes separately. the keys across different probe types are
  // different enough that it would require implementing a type for each
  // probe. if there becomes an obvious need to check them in the future
  // that will be the time to implement.
  const probes = {}

  // only consider known probes
  Object.keys(probeDefaults).forEach(mod => {
    probes[mod] = Object.assign({}, probeDefaults[mod])
    Object.assign(probes[mod], fileConfig.probes[mod] || {})
    delete fileConfig.probes[mod]
  })
  results.probes = probes

  // handle excluded urls separately. the form is an array of
  // objects, each of the form:
  //   {type: url, <type-specific-values>}
  //   {type: url, string|regex: pattern, tracing: enabled|disabled}
  const {transactionSettings, settingsErrors} = parsetransactionSettings(
    fileConfig.transactionSettings
  )
  results.transactionSettings = transactionSettings
  results.settingsErrors = settingsErrors


  // now report any unused probes
  let unused = Object.keys(fileConfig.probes)
  if (unused.length) {
    results.unusedProbes = unused
  }
  // report any key other than probes and transactionSettings as unused
  delete fileConfig.probes
  delete fileConfig.transactionSettings
  unused = Object.keys(fileConfig)
  if (unused.length) {
    results.unusedConfig = unused
  }

  return results
}

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

