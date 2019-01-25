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

module.exports = function (configPath, probeDefaultsPath) {
  //
  // read the configuration file if it exists.
  //
  const results = {
    file: {},                   // the contents of the configuration file
    config: undefined,
    probes: undefined,
    unusedConfig: undefined,    // parts of the configuration file that weren't used
    unusedProbes: undefined,    // probes in the configuration file that weren't used
    configError: undefined,     // errors reading file
    defaultsError: undefined,
  }

  let fileConfig
  try {
    fileConfig = require(configPath)
  } catch (e) {
    fileConfig = {}
    results.configError = e
  }
  // copy the config so unknown keys can be reported to the caller
  results.file = Object.assign({}, fileConfig)

  if (!fileConfig.probes) {
    fileConfig.probes = {}
  }

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
  let probeDefaults
  try {
    probeDefaults = require(probeDefaultsPath)
  } catch (e) {
    probeDefaults = {probes: {}}
    results.defaultsError = e
  }

  // only consider known probes
  Object.keys(probeDefaults.probes).forEach(mod => {
    probes[mod] = probeDefaults.probes[mod]
    Object.assign(probes[mod], fileConfig.probes[mod] || {})
    delete fileConfig.probes[mod]
  })
  results.probes = probes

  // now report any unused probes
  let unused = Object.keys(fileConfig.probes)
  if (unused.length) {
    results.unusedProbes = unused
  }
  // report any key other than probes as unused
  delete fileConfig.probes
  unused = Object.keys(fileConfig)
  if (unused.length) {
    results.unusedConfig = unused
  }

  return results
}

if (!module.parent) {
  console.log(
    module.exports('../appoptics-apm.json', './probe-defaults')
  )
}
