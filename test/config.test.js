'use strict'

const parseConfig = require('../lib/parse-config')

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
  transactionSettings: undefined,
  unusedConfig: undefined,
  unusedProbes: undefined,
  settingsErrors: undefined
}

const defaultedConfig = cloneConfig(emptyConfig)
defaultedConfig.global = Object.assign({}, globalDefaults)

// config to verify each key has been set
const config1 = {
  enabled: false,
  hostnameAlias: 'bruce',
  traceMode: 'never',
  sampleRate: 1000000,
  serviceKey: 'f'.repeat(64),
  ignoreConflicts: true,
  domainPrefix: 'fubar',
}

const configFile1Expected = cloneConfig(defaultedConfig)
Object.keys(config1).forEach(k => {
  configFile1Expected.global[k] = config1[k]
})

function cloneConfig (config, mergeConfig) {
  const clone = Object.assign({}, config)
  clone.file = Object.assign({}, config.file)
  clone.global = Object.assign({}, config.global)
  clone.probes = Object.assign({}, config.probes)
  if (config.transactionSettings) clone.transactionSettings = config.transactionSettings.slice()
  if (config.unusedConfig) clone.unusedConfig = config.unusedConfig.slice()
  if (config.unusedProbes) clone.unusedProbes = config.unusedProbes.slice()
  if (config.settingsErrors) clone.settingsErrors = config.settingsErrors.slice()

  Object.assign(clone, mergeConfig)

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

const defaults = {global: globalDefaults, probes: probeDefaults}

//==============
// start testing
//==============
describe('config', function () {

  it('should handle no config and no defaults', function () {
    let config = parseConfig()
    expect(config).deep.equal(emptyConfig)

    config = parseConfig({}, {})
    expect(config).deep.equal(emptyConfig)
  })

  it('should not set global configuration when no defaults', function () {
    const fileConfig = {enabled: true}
    const expected = cloneConfig(emptyConfig, {file: fileConfig, unusedConfig: ['enabled']})

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should use defaults when no configuration is supplied', function () {
    const fileConfig = {}
    const expected = cloneConfig(emptyConfig, {global: globalDefaults})

    const config = parseConfig(fileConfig, {global: globalDefaults})
    expect(config).deep.equal(expected)
  })

  it('should set known config keys', function () {
    const expected = cloneConfig(emptyConfig, {
      file: config1,
      global: config1
    })

    const config = parseConfig(config1, {global: globalDefaults})
    expect(config).deep.equal(expected)

    // make sure that there are no extra keys
    expect(Object.keys(config.global)).members(Object.keys(config1))
  })

  it('should not set unknown config keys', function () {
    const badKey = {badKeyRising: 'i have been a bad key'}
    const expected = cloneConfig(emptyConfig, {
      file: badKey,
      global: globalDefaults,
      unusedConfig: ['badKeyRising']}
    )

    const config = parseConfig(badKey, {global: globalDefaults})
    expect(config).deep.equal(expected)
  })

  it('should set known probe keys', function () {
    const fileConfig = {probes: {fs: {enabled: true, collectBacktraces: false}}}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      probes: Object.assign({}, probeDefaults, fileConfig.probes)
    })

    const config = parseConfig(fileConfig, {probes: probeDefaults})
    expect(config).deep.equal(expected)
  })

  it('should set both global and probe defaults', function () {
    const fileConfig = {}
    const expected = cloneConfig(emptyConfig, {
      global: globalDefaults,
      probes: probeDefaults
    })

    const config = parseConfig(fileConfig, defaults)
    expect(config).deep.equal(expected)
  })

  it('should not set unknown probe keys', function () {
    const fileConfig = {probes: {xyzzy: {enabled: true, collectBacktraces: false}}}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      probes: Object.assign({}, probeDefaults),
      unusedProbes: ['xyzzy']
    })

    const config = parseConfig(fileConfig, {probes: probeDefaults})
    expect(config).deep.equal(expected)
  })

  it('should allow RegExp and string forms of URL settings', function () {
    const fileConfig = {transactionSettings: [
      {type: 'url', regex: /xyzzy/, tracing: 'disabled'},
      {type: 'url', regex: 'hello', tracing: 'disabled'},
      {type: 'url', string: '/xy(zzy', tracing: 'disabled'},
    ]}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      transactionSettings: fileConfig.transactionSettings.map(s => {
        return {
          type: 'url',
          pattern: s.string ? s.string : (s.regex instanceof RegExp ? s.regex : new RegExp(s.regex)),
          doSample: false,
          doMetrics: false}
      })
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should report invalid RegExp', function () {
    const fileConfig = {transactionSettings: [
      {type: 'url', regex: /plover's egg/, tracing: 'disabled'},
      {type: 'url', regex: 'but this(is not valid', tracing: 'disabled'},
    ]}
    let specialError
    try {new RegExp(fileConfig.transactionSettings[1].regex)} catch (e) {specialError = e.message}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      transactionSettings: [{
        type: 'url',
        pattern: fileConfig.transactionSettings[0].regex,
        doSample: false,
        doMetrics: false
      }],
      settingsErrors: [{spec: fileConfig.transactionSettings[1], error: specialError}]
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should report invalid transactionSettings entries', function () {
    const fileConfig = {transactionSettings: [
      {type: 'url', regex: /hello/, string: 'i am a string'},
      {regex: 17},
      {type: 'url', regex: /hello/},
      {type: 'url', regex: /hello/, tracing: 'invalid'},
      {type: 'url', tracing: 'enabled'},
    ]}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      settingsErrors: [
        {spec: fileConfig.transactionSettings[0], error: 'must specify one, not both, of "string" and "regex"'},
        {spec: fileConfig.transactionSettings[1], error: 'invalid type: "undefined"'},
        {spec: fileConfig.transactionSettings[2], error: 'invalid tracing value: "undefined"'},
        {spec: fileConfig.transactionSettings[3], error: 'invalid tracing value: "invalid"'},
        {spec: fileConfig.transactionSettings[4], error: 'must specify one, not both, of "string" and "regex"'},
      ]
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should allow a single transactionSettings entry', function () {
    const fileConfig = {transactionSettings: {type: 'url', regex: /i'm a shrimp/, tracing: 'disabled'}}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      transactionSettings: [{
        type: 'url',
        pattern: fileConfig.transactionSettings.regex,
        doSample: false,
        doMetrics: false
      }]
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

})
