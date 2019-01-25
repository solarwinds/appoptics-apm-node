'use strict'
const helper = require('./helper')
const ao = helper.ao

const parseConfig = require('../lib/parse-config-file')

const expect = require('chai').expect

const empty = {
  file: {},
  config: {
    enabled: true,
    hostnameAlias: undefined,
    traceMode: undefined,
    sampleRate: undefined,
    serviceKey: undefined,
    ignoreConflicts: false,
    domainPrefix: false
  },
  probes: {},
  specials: undefined,
  unusedConfig: undefined,
  unusedProbes: undefined,
  specialsErrors: undefined
}

const configFile1 = {
  enabled: false,
  hostnameAlias: 'bruce',
  traceMode: 'never',
  sampleRate: 1000000,
  serviceKey: 'f'.repeat(64),
  ignoreConflicts: true,
  domainPrefix: 'fubar',
}

const configFile1Expected = cloneConfig(empty)
Object.keys(configFile1).forEach(k => {
  configFile1Expected.config[k] = configFile1[k]
})

function cloneConfig (config) {
  const clone = Object.assign({}, config)
  clone.file = Object.assign({}, config.file)
  clone.config = Object.assign({}, config.config)
  clone.probes = Object.assign({}, config.probes)
  if (config.specials) clone.specials = config.specials.slice()
  if (config.unusedConfig) clone.unusedConfig = config.unusedConfig.slice()
  if (config.unusedProbes) clone.unusedProbes = config.unusedProbes.slice()
  if (config.specialsErrors) clone.specialsErrors = config.specialsErrors.slice()

  return clone
}

//
// start testing
//
describe('config', function () {
  it('should handle empty config and probe files', function () {
    let config = parseConfig()
    expect(config).deep.equal(empty)
    config = parseConfig({}, {})
    expect(config).deep.equal(empty)
  })

  it('should set known config keys', function () {
    const config = parseConfig(configFile1)
    expect(config.file).include(configFile1)
    expect(config.config).include(configFile1)
  })

})
