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
          pattern: s.string ? s.string
            : (s.regex instanceof RegExp ? s.regex : new RegExp(s.regex)),
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

  it('should correctly read environment variables', function () {
    copyKeys(process.env, savedKeys);
    copyKeys(testKeyValues, process.env);

    const environment = require('../lib/c-lib-env-vars');

    const envValues = environment.fetch();

    expect(envValues.valid).deep.equal(expectedValidValues);
    expect(envValues.invalid).deep.equal(expectedInvalid);

    copyKeys(savedKeys, process.env);
  })

  const keys = {
    SERVICE_KEY: {name: 'serviceKey', type: 's'},
    TRUSTEDPATH: {name: 'trustedPath', type: 's'},
    HOSTNAME_ALIAS: {name: 'hostnameAlias', type: 's'},
    DEBUG_LEVEL: {name: 'logLevel', type: 'i'},
    TRIGGER_TRACE: {name: 'triggerTrace', type: {enable: 1, disable: 0} },
    REPORTER: {name: 'reporter', type: 's'},
    COLLECTOR: {name: 'endpoint', type: 's'},
    TOKEN_BUCKET_CAPACITY: {name: 'tokenBucketCapacity', type: 'i'},      // file and udp reporter
    TOKEN_BUCKET_RATE: {name: 'tokenBucketRate', type: 'i'},              // file and udp reporter
    // not used by node agent
    BUFSIZE: {name: 'bufferSize', type: 'i'},
    LOGNAME: {name: 'logFilePath', type: 's'},
    TRACE_METRICS: {name: 'traceMetrics', type: 'b'},
    HISTOGRAM_PRECISION: {name: 'histogramPrecision', type: 'i'},
    MAX_TRANSACTIONS: {name: 'maxTransactions', type: 'i'},
    FLUSH_MAX_WAIT_TIME: {name: 'flushMaxWaitTime', type: 'i'},
    EVENTS_FLUSH_INTERVAL: {name: 'eventsFlushInterval', type: 'i'},
    EVENTS_FLUSH_BATCH_SIZE: {name: 'eventsFlushBatchSize', type: 'i'},
    REPORTER_FILE_SINGLE: {name: 'oneFilePerEvent', type: 'b'},
    // key for testing only
    XYZZY: {name: 'xyzzy', type: 's'},
  };

  const testKeyValues = {
    APPOPTICS_SERVICE_KEY: 'test-string',
    APPOPTICS_TRUSTEDPATH: 'test-path',
    APPOPTICS_HOSTNAME_ALIAS: 'test-name',
    APPOPTICS_DEBUG_LEVEL: '3',
    APPOPTICS_TRIGGER_TRACE: 'enable',
    APPOPTICS_REPORTER: 'udp',
    //APPOPTICS_COLLECTOR: undefined, // leave out to test endpoint not present
    APPOPTICS_TOKEN_BUCKET_CAPACITY: '1000',
    APPOPTICS_TOKEN_BUCKET_RATE: '1000',
    // not used by node agent
    APPOPTICS_BUFSIZE: '1000',
    APPOPTICS_LOGNAME: 'test-unused-log-name',
    APPOPTICS_TRACE_METRICS: 'no',
    APPOPTICS_HISTOGRAM_PRECISION: '1000',
    APPOPTICS_MAX_TRANSACTIONS: '25000',
    APPOPTICS_FLUSH_MAX_WAIT_TIME: '2000',
    APPOPTICS_EVENTS_FLUSH_INTERVAL: '4000',
    APPOPTICS_EVENTS_FLUSH_BATCH_SIZE: '1000',
    APPOPTICS_REPORTER_FILE_SINGLE: 'yes',
    APPOPTICS_XYZZY: 'plover',
  }

  const expectedValidValues = {
    tokenBucketRate: 1000,
    serviceKey: 'test-string',
    //endpoint: 'undefined',
    reporter: 'udp',
    tokenBucketCapacity: 1000,
    trustedPath: 'test-path',
    hostnameAlias: 'test-name',
    logLevel: 3,
    triggerTrace: 1,
    bufferSize: 1000,
    logFilePath: 'test-unused-log-name',
    traceMetrics: false,
    histogramPrecision: 1000,
    maxTransactions: 25000,
    flushMaxWaitTime: 2000,
    eventsFlushInterval: 4000,
    eventsFlushBatchSize: 1000,
    oneFilePerEvent: true
  }

  const expectedInvalid = ['APPOPTICS_XYZZY=plover'];

  const savedKeys = {};

  function copyKeys (source, destination) {
    for (let k in keys) {
      const ak = `APPOPTICS_${k}`;
      if (ak in source) {
        destination[ak] = source[ak];
      } else {
        delete destination[ak];
      }
    }
  }

})
