'use strict'

const parseConfig = require('../lib/parse-config-file')

const expect = require('chai').expect

const globalDefaults = {
  enabled: true,
  hostnameAlias: undefined,
  traceMode: undefined,
  sampleRate: undefined,
  serviceKey: undefined,
  ignoreConflicts: false,
  domainPrefix: false
}

const emptyConfig = {
  file: {},
  global: {},
  probes: {},
  specials: undefined,
  unusedConfig: undefined,
  unusedProbes: undefined,
  specialsErrors: undefined
}

const defaultedConfig = cloneConfig(emptyConfig)
defaultedConfig.global = Object.assign({}, globalDefaults)

// config to verify each key has been set
const configFile1 = {
  enabled: false,
  hostnameAlias: 'bruce',
  traceMode: 'never',
  sampleRate: 1000000,
  serviceKey: 'f'.repeat(64),
  ignoreConflicts: true,
  domainPrefix: 'fubar',
}

const configFile1Expected = cloneConfig(defaultedConfig)
Object.keys(configFile1).forEach(k => {
  configFile1Expected.global[k] = configFile1[k]
})

function cloneConfig (config) {
  const clone = Object.assign({}, config)
  clone.file = Object.assign({}, config.file)
  clone.global = Object.assign({}, config.global)
  clone.probes = Object.assign({}, config.probes)
  if (config.specials) clone.specials = config.specials.slice()
  if (config.unusedConfig) clone.unusedConfig = config.unusedConfig.slice()
  if (config.unusedProbes) clone.unusedProbes = config.unusedProbes.slice()
  if (config.specialsErrors) clone.specialsErrors = config.specialsErrors.slice()

  return clone
}

const probeDefaults = {
  crypto: {
    enabled: true,
    collectBacktraces: true
  },
  fs: {
    enabled: true,
    collectBacktraces: true
  },
}


//
// start testing
//
describe('config', function () {

  it('should handle undefined config and probe files', function () {
    const expected = cloneConfig(defaultedConfig)
    let config = parseConfig()

    expect(config).deep.equal(expected)
    config = parseConfig({}, {})
    expect(config).deep.equal(expected)
  })

  it('should set known config keys', function () {
    const config = parseConfig(configFile1)

    expect(config.file).include(configFile1)
    expect(config.global).include(configFile1)
    // make sure that there are no extra keys
    expect(Object.keys(config.global)).members(Object.keys(configFile1))
  })

  it('should not set unknown config keys', function () {
    const badKey = {badKeyRising: 'i have been a bad key'}

    const config = parseConfig(badKey)

    // verify that the the input is echoed correctly (file), that
    // the defaults are present, that the bad key is not included
    // in the config, and that the unused key is reported.
    expect(config.file).deep.equal(badKey)
    expect(config.global).include(globalDefaults)
    expect(config.global).not.property('badKeyRising')
    expect(config.probes).deep.equal({})
    expect(config.specials).undefined

    expect(config.unusedConfig).eql(['badKeyRising'])
    expect(config.unusedProbes).undefined
    expect(config.specialsErrors).undefined
  })

  it('should set known probe keys', function () {
    const fileConfig = {probes: {fs: {enabled: true, collectBacktraces: false}}}

    const config = parseConfig(fileConfig, probeDefaults)

    expect(config.file).deep.equal(fileConfig)
    expect(config.global).include(globalDefaults)
    expect(config.probes.fs).deep.equal({enabled: true, collectBacktraces: false})

    expect(config.specials).undefined
    expect(config.unusedConfig).undefined
    expect(config.unusedProbes).undefined
    expect(config.specialsErrors).undefined
  })

  it('should not set unknown probe keys', function () {
    debugger
    const fileConfig = {probes: {xyzzy: {enabled: true, collectBacktraces: false}}}

    const config = parseConfig(fileConfig, probeDefaults)

    expect(config.file).deep.equal(fileConfig)
    expect(config.global).include(globalDefaults)
    expect(config.probes.crypto).deep.equal({enabled: true, collectBacktraces: true})
    expect(config.probes.fs).deep.equal({enabled: true, collectBacktraces: true})
    expect(config.probes.xyzzy).undefined

    expect(config.specials).undefined
    expect(config.unusedConfig).undefined
    expect(config.unusedProbes).deep.equal(['xyzzy'])
    expect(config.specialsErrors).undefined
  })

})
