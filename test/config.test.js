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
  specialUrls: undefined,
  unusedConfig: undefined,
  unusedProbes: undefined,
  specialsErrors: undefined
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
  if (config.specialUrls) clone.specialUrls = config.specialUrls.slice()
  if (config.unusedConfig) clone.unusedConfig = config.unusedConfig.slice()
  if (config.unusedProbes) clone.unusedProbes = config.unusedProbes.slice()
  if (config.specialsErrors) clone.specialsErrors = config.specialsErrors.slice()

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

  it('should allow RegExp and string forms of special URLs', function () {
    const fileConfig = {specialUrls: [
      {regex: /xyzzy/, mode: 'never'},
      {regex: 'hello'},
      {url: '/xy(zzy'}
    ]}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      specialUrls: fileConfig.specialUrls.map(s => {
        return {
          url: s.url ? s.url : (s.regex instanceof RegExp ? s.regex : new RegExp(s.regex)),
          doSample: false,
          doMetrics: false}
      })
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should report invalid RegExp', function () {
    const fileConfig = {specialUrls: [
      {regex: /plover's egg/},
      {regex: 'but this(is not valid'},
    ]}
    let specialError
    try {new RegExp(fileConfig.specialUrls[1].regex)} catch (e) {specialError = e.message}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      specialUrls: [{url: fileConfig.specialUrls[0].regex, doSample: false, doMetrics: false}],
      specialsErrors: [{spec: fileConfig.specialUrls[1], error: specialError}]
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should report invalid specialUrls entries', function () {
    const fileConfig = {specialUrls: [
      {regex: /hello/, url: 'i am a string'},
      {regex: 17},
      {url: true}
    ]}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      specialsErrors: [
        {spec: fileConfig.specialUrls[0], error: 'must specify one, not both, of "url" and "regex"'},
        {spec: fileConfig.specialUrls[1], error: 'invalid specialUrl'},
        {spec: fileConfig.specialUrls[2], error: 'invalid specialUrl'},
      ]
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should allow a single specialUrls entry', function () {
    const fileConfig = {specialUrls: {regex: /i'm a shrimp/}}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      specialUrls: [{url: fileConfig.specialUrls.regex, doSample: false, doMetrics: false}]
    })

    const config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

  it('should accept traceMode "never" and no other value', function () {
    const fileConfig = {specialUrls: {regex: /and so am i/, traceMode: 'never'}}
    let expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      specialUrls: [{url: fileConfig.specialUrls.regex, doSample: false, doMetrics: false}]
    })

    let config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)

    fileConfig.specialUrls.traceMode = 'always'
    expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      specialsErrors: [{spec: fileConfig.specialUrls, error: 'invalid traceMode: "always"'}]
    })

    config = parseConfig(fileConfig)
    expect(config).deep.equal(expected)
  })

})
