'use strict'

//
// parse the user's file configuration using probe defaults.
//
// fileConfig - the configuration object from the user's configuration file
// probeDefaults - the default values to use for the probes.
//
module.exports = function (fileConfig, defaults = {}) {
  fileConfig = Object.assign({}, fileConfig)
  const globalDefaults = Object.assign({}, defaults.global)
  const probeDefaults = Object.assign({}, defaults.probes)

  const results = {
    file: fileConfig,           // echo fileConfig
    global: undefined,
    probes: undefined,
    specialUrls: undefined,
    unusedConfig: undefined,    // parts of the configuration file that weren't used
    unusedProbes: undefined,    // probes in the configuration file that weren't used
    specialsErrors: undefined,  // errors parsing/handling specialUrls
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
  //   {urlRegex: string or regex, traceMode: 'never'}
  // where the url is required but traceMode is not (the only
  // valid value at this time is 'never').
  const {specialUrls, specialsErrors} = parseSpecialUrls(fileConfig.specialUrls)
  results.specialUrls = specialUrls
  results.specialsErrors = specialsErrors


  // now report any unused probes
  let unused = Object.keys(fileConfig.probes)
  if (unused.length) {
    results.unusedProbes = unused
  }
  // report any key other than probes and specialUrls as unused
  delete fileConfig.probes
  delete fileConfig.specialUrls
  unused = Object.keys(fileConfig)
  if (unused.length) {
    results.unusedConfig = unused
  }

  return results
}

//
// function to parse the specialUrls patterns.
//
function parseSpecialUrls (specialUrls) {
  const goodSpecials = []
  const errors = []

  const results = {specialUrls: undefined, specialsErrors: undefined}

  if (!specialUrls) {
    return results
  }

  if (!Array.isArray(specialUrls)) specialUrls = [specialUrls]

  specialUrls.forEach(special => {
    // presume success of one form or another
    const goodEntry = {url: undefined, doSample: false, doMetrics: false}

    if (!('url' in special ^ 'regex' in special)) {
      errors.push({spec: special, error: 'must specify one, not both, of "url" and "regex"'})
      return
    }

    // now check the specified URL pattern. handle both RegExp and strings
    // because the config file can be JSON or a module. JSON cannot have a
    // RegExp value but a module can.
    if (special.regex instanceof RegExp) {
      goodEntry.url = special.regex
      goodSpecials.push(goodEntry)
    } else if (typeof special.regex === 'string') {
      let re
      try {
        re = new RegExp(special.regex)
        goodEntry.url = re
      } catch (e) {
        errors.push({spec: special, error: e.message})
      }
      if (re) {
        goodSpecials.push(goodEntry)
      }
    } else if (special.url && typeof special.url === 'string') {
      goodEntry.url = special.url
      goodSpecials.push(goodEntry)
    } else {
      errors.push({spec: special, error: 'invalid specialUrl'})
    }
  })

  if (goodSpecials.length) results.specialUrls = goodSpecials
  if (errors.length) results.specialsErrors = errors

  return results
}

if (!module.parent) {
  const config = require('../appoptics-apm.json')
  const defaults = require('./config-defaults').probes
  console.log('test #1')
  console.log(
    module.exports(config, defaults)
  )
  console.log('test #2')
  console.log(module.exports())
}
