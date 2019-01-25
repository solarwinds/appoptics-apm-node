'use strict'

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

//
// this function is destructive to fileConfig and probeDefaults. it removes
// keys as it uses them.
//
module.exports = function (fileConfig, probeDefaults) {
  //
  // read the configuration file if it exists.
  //
  const results = {
    file: {},                   // the contents of the configuration file
    config: undefined,
    probes: undefined,
    excludes: undefined,
    unusedConfig: undefined,    // parts of the configuration file that weren't used
    unusedProbes: undefined,    // probes in the configuration file that weren't used
    excludesErrors: undefined,  // errors parsing/handling exclude specifications
  }

  // copy the config so unknown keys can be reported to the caller
  results.file = Object.assign({}, fileConfig)

  // make sure each has a probes object.
  if (!fileConfig.probes) fileConfig.probes = {}
  if (!probeDefaults.probes) probeDefaults.probes = {}

  const config = {}
  // only consider expected keys
  for (const key of Object.keys(configDefaults)) {
    config[key] = key in fileConfig ? fileConfig[key] : configDefaults[key]
    delete fileConfig[key]
  }
  results.config = config

  // handle probes separately. the keys across different probe types are
  // different enough that it would require implementing a type for each
  // probe. if there becomes an obvious need to check them in the future
  // that will be the time to implement.
  const probes = {}

  // only consider known probes
  Object.keys(probeDefaults.probes).forEach(mod => {
    probes[mod] = probeDefaults.probes[mod]
    Object.assign(probes[mod], fileConfig.probes[mod] || {})
    delete fileConfig.probes[mod]
  })
  results.probes = probes

  // handle excluded urls separately. the form is an array of
  // objects, each of the form:
  //   {urlRegex: string or regex, traceMode: 'never'}
  // where the url is required but traceMode is not (the only
  // valid value at this time is 'never').
  const {excludes, excludesErrors} = parseExcludes(fileConfig.excludes)
  results.excludes = excludes
  results.excludesErrors = excludesErrors


  // now report any unused probes
  let unused = Object.keys(fileConfig.probes)
  if (unused.length) {
    results.unusedProbes = unused
  }
  // report any key other than probes and excludes as unused
  delete fileConfig.probes
  delete fileConfig.excludes
  unused = Object.keys(fileConfig)
  if (unused.length) {
    results.unusedConfig = unused
  }

  return results
}

function parseExcludes (excludes) {
  const goodExcludes = []
  const errors = []

  const results = {excludes: undefined, excludesErrors: undefined}

  if (!excludes) {
    return results
  }

  if (!Array.isArray(excludes)) excludes = [excludes]

  excludes.forEach(exclude => {
    // presume success of one form or another
    const goodEntry = {url: undefined, doSample: false, doMetrics: false}

    // now check the specified URL pattern. handle both RegExp and strings
    // because the config file can be JSON or a module. JSON cannot have a
    // RegExp value but a module can.
    if (exclude.url instanceof RegExp) {
      goodEntry.url = exclude.url
      goodExcludes.push(goodEntry)
    } else if (typeof exclude.url === 'string') {
      let re
      try {
        re = new RegExp(exclude.url)
        goodEntry.url = re
      } catch (e) {
        errors.push({spec: exclude, error: e.message})
      }
      if (re) {
        goodExcludes.push(goodEntry)
      }
    } else {
      errors.push({spec: exclude, error: 'invalid type'})
    }
  })

  if (goodExcludes.length) results.excludes = goodExcludes
  if (errors.length) results.excludesErrors = errors

  return results
}

if (!module.parent) {
  const config = require('../appoptics-apm.json')
  const defaults = require('./probe-defaults')
  console.log(
    module.exports(config, defaults)
  )
}
