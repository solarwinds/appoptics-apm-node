'use strict'

const fs = require('fs');
const path = require('path');

const expect = require('chai').expect;

const relativeDir = '..';
const guc = require(`${relativeDir}/lib/get-unified-config`);

//
// expected results when neither a config file nor environment variables are present.
//
const expectedGlobalDefaults = {
  enabled: true,
  triggerTraceEnabled: true,
  traceMode: 1,
  logLevel: 2,
}

const expectedProbeDefaults = require(`${relativeDir}/lib/probe-defaults`);

const emptyConfig = {
  file: '',                           // the resolved configuration file path
  global: {},                         // the top-level configuration items
  unusedConfig: [],                   // parts of the global configuration that weren't used
  unusedEnvVars: [],                  // environment variables starting with APPOPTICS_ that weren't used
  probes: {},                         // probe settings
  unusedProbes: [],                   // probes in the configuration file that weren't used
  transactionSettings: undefined,     // special settings based on transaction type
  settingsErrors: [],                 // errors parsing/handling transactionSettings
  errors: [],                         // general errors
  warnings: [],                       // general warnings
}

/*

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
// */
const rootConfigName = `${process.cwd()}/appoptics-apm`;

function doChecks (cfg, overrides = {}) {
  let expected;

  expected = overrides.file || rootConfigName;
  expect(cfg.file).equal(expected);

  expected = Object.assign({}, expectedGlobalDefaults, overrides.global);
  expect(cfg.global).deep.equal(expected, 'global mismatch');

  expected = Object.assign({}, expectedProbeDefaults);
  for (const k in overrides.probes) {
    expected[k] = Object.assign({}, expected[k], overrides.probes[k]);
  }
  expect(cfg.probes).deep.equal(expected, 'probes mismatch');

  expected = overrides.unusedConfig || [];
  expect(cfg.unusedConfig).an('array').deep.equal(expected, 'unusedConfig mismatch');

  expected = overrides.unusedEnvVars || [];
  expect(cfg.unusedEnvVars).an('array').deep.equal(expected, 'unusedEnvVars mismatch');

  expected = overrides.unusedProbes || [];
  expect(cfg.unusedProbes).an('array').deep.equal(expected, 'unusedProbes mismatch');

  expect(cfg.transactionSettings).undefined;

  expected = overrides.settingsErrors || [];
  expect(cfg.settingsErrors).an('array').deep.equal(expected, 'settingsErrors mismatch');

  expected = overrides.errors || [];
  expect(cfg.errors).an('array').deep.equal(expected, 'errors mismatch');


  expected = overrides.warnings || [];
  expect(cfg.warnings).an('array').deep.equal(expected, 'warnings mismatch');
}

function writeConfigJSON (cfg) {
  writeConfigLiteral(JSON.stringify(cfg));
}

function writeConfigLiteral (text) {
  fs.writeFileSync(`${rootConfigName}.json`, text, 'utf8');
}

function writeConfigJs (cfg) {

}


//==============
// start testing
//==============
describe('config', function () {
  //
  // save the configuration
  //
  const savedEnv = {};
  before (function () {
    for (const k in process.env) {
      if (k.startsWith('APPOPTICS_')) {
        savedEnv[k] = process.env[k];
        delete process.env[k];
      }
    }
    try {fs.renameSync(`${rootConfigName}.json`, `${rootConfigName}-renamed.json`)} catch (e) {}
    try {fs.renameSync(`${rootConfigName}.js`, `${rootConfigName}-renamed.js`)} catch (e) {}
  })

  // clean up after every test.
  afterEach (function () {
    // clean up the environment variables
    for (const k in process.env) {
      if (k.startsWith('APPOPTICS_')) {
        delete process.env[k];
      }
    }
    // remove any files created with the default name
    try {fs.unlinkSync(`${rootConfigName}.json`)} catch (e) {}
    try {fs.unlinkSync(`${rootConfigName}.js`)} catch (e) {}
    // clear the require cache
    delete require.cache[`${rootConfigName}.json`];
    delete require.cache[`${rootConfigName}.js`];
  })

  //
  // restore the configuration
  //
  after (function () {
    for (const k in savedEnv) {
      process.env[k] = savedEnv[k];
    }
    try {fs.renameSync(`${rootConfigName}-renamed.json`, `${rootConfigName}.json`)} catch (e) {}
    try {fs.renameSync(`${rootConfigName}-renamed.js`, `${rootConfigName}.js`)} catch (e) {}
  })

  //============================
  // individual tests start here
  //============================

  it('should default correctly when no config file or env vars', function () {
    const cfg = guc();

    doChecks(cfg);
  })

  it('should set known config keys in a config file', function () {
    const config = {
      enabled: false,
      hostnameAlias: 'bruce',
      serviceKey: 'f'.repeat(64),
      ignoreConflicts: true,
      domainPrefix: 'fubar',
    }
    writeConfigJSON(config);

    const cfg = guc();

    doChecks(cfg, {global: config});
  })

  it('should override config file keys when environment variables are present', function () {
    const config = {
      enabled: false,
      hostnameAlias: 'bruce',
      serviceKey: 'f'.repeat(64),
      ignoreConflicts: true,
      domainPrefix: 'fubar',
    }
    writeConfigJSON(config);
    process.env.APPOPTICS_SERVICE_KEY = 'ab'.repeat(32);
    process.env.APPOPTICS_HOSTNAME_ALIAS = 'macnaughton';

    const cfg = guc();

    config.hostnameAlias = process.env.APPOPTICS_HOSTNAME_ALIAS;
    config.serviceKey = process.env.APPOPTICS_SERVICE_KEY;
    doChecks(cfg, {global: config});
  })

  it('should warn about deprecated config file keys', function () {
    const config = {
      traceMode: 'always',
      sampleRate: 1000000,
    }
    writeConfigJSON(config);

    const cfg = guc();

    // fix up to match translated value.
    config.traceMode = 1;
    const warnings = [
      'traceMode is deprecated; it will be invalid in the future',
      'sampleRate is deprecated; it will be invalid in the future',
    ];
    doChecks(cfg, {global: config, warnings});
  })

  it('should warn about unknown config keys', function () {
    const config = {badKeyRising: 'i have been a bad key'};
    writeConfigJSON(config);

    const cfg = guc();

    const unusedConfig = ['badKeyRising: i have been a bad key'];
    doChecks(cfg, {unusedConfig});
  })

  it('should warn about unknown APPOPTICS_ environment variables', function () {
    process.env.APPOPTICS_YINYIN_ROCKS = 'truth';

    const cfg = guc();

    const unusedEnvVars = ['APPOPTICS_YINYIN_ROCKS=truth'];
    doChecks(cfg, {unusedEnvVars});
  })

  it('should not set keys with invalid values', function () {
    const config = {ec2MetadataTimeout: 'hello', createTraceIdsToken: 'bruce'};
    writeConfigJSON(config);

    const cfg = guc();

    const warnings = [
      'invalid configuration file value createTraceIdsToken: bruce',
      'invalid configuration file value ec2MetadataTimeout: hello',
    ];
    doChecks(cfg, {warnings});
  })

  it('should not set use environment variable values', function () {
    process.env.APPOPTICS_EC2_METADATA_TIMEOUT = 'xyzzy';

    const cfg = guc();

    const warnings = ['invalid environment variable value APPOPTICS_EC2_METADATA_TIMEOUT=xyzzy'];
    doChecks(cfg, {warnings});
  })

  it('should keep valid config file value when there is a bad env var value', function () {
    const config = {ec2MetadataTimeout: 1000};
    writeConfigJSON(config);
    process.env.APPOPTICS_EC2_METADATA_TIMEOUT = 'xyzzy';

    const cfg = guc();

    const warnings = ['invalid environment variable value APPOPTICS_EC2_METADATA_TIMEOUT=xyzzy'];
    doChecks(cfg, {global: config, warnings});
  })

  it('should correctly report an error for a non-default config file', function () {
    const file = process.env.APPOPTICS_APM_CONFIG_NODE = 'xyzzy-bruce.json';
    const fullpath = `${process.cwd()}/${file}`;

    const cfg = guc();

    const message = 'Cannot find module \'/home/bruce/solarwinds/ao-agent/xyzzy-bruce.json\'';
    const errors = [
      `Cannot read config file ${fullpath}: ${message}`
    ]
    doChecks(cfg, {file: fullpath, errors});
  })

  it('should correctly report an error for a bad config file', function () {
    writeConfigLiteral('{"i am: bad\n');

    const cfg = guc();

    const errors = [[
      'Cannot read config file /home/bruce/solarwinds/ao-agent/appoptics-apm: ',
      '/home/bruce/solarwinds/ao-agent/appoptics-apm.json: Unexpected token \n in JSON at position 11'
    ].join('')];
    doChecks(cfg, {errors});
  })

  it('should set probe values correctly', function () {
    const config = {probes: {fs: {enabled: false, bruce: 'says hello'}}};
    writeConfigJSON(config);

    const cfg = guc();
    doChecks(cfg, {probes: config.probes});
  })

  it.skip('should not set unknown probe keys', function () {
    const fileConfig = {probes: {xyzzy: {enabled: true, collectBacktraces: false}}}
    const expected = cloneConfig(emptyConfig, {
      file: fileConfig,
      probes: Object.assign({}, probeDefaults),
      unusedProbes: ['xyzzy']
    })

    const config = parseConfig(fileConfig, {probes: probeDefaults})
    expect(config).deep.equal(expected)
  })

  it.skip('should allow RegExp and string forms of URL settings', function () {
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

  it.skip('should report invalid RegExp', function () {
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

  it.skip('should report invalid transactionSettings entries', function () {
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

  it.skip('should allow a single transactionSettings entry', function () {
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

  it.skip('should correctly read environment variables', function () {
    copyKeys(process.env, savedKeys);
    copyKeys(testKeyValues, process.env);

    const environment = require('../lib/c-lib-env-vars');

    const envValues = environment.fetch();

    expect(envValues.valid).deep.equal(expectedValidValues);
    expect(envValues.invalid).deep.equal(expectedInvalid);

    copyKeys(savedKeys, process.env);
  })

  function warn (...args) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }

  const keys = {
    SERVICE_KEY: {name: 'serviceKey', type: 's'},
    TRUSTEDPATH: {name: 'trustedPath', type: 's'},
    HOSTNAME_ALIAS: {name: 'hostnameAlias', type: 's'},
    DEBUG_LEVEL: {name: 'logLevel', type: 'i'},
    TRIGGER_TRACE: {name: 'triggerTrace', type: {enable: 1, disable: 0}},
    REPORTER: {name: 'reporter', type: 's'},
    COLLECTOR: {name: 'endpoint', type: 's'},
    TOKEN_BUCKET_CAPACITY: {name: 'tokenBucketCapacity', type: 'i'},      // file and udp reporter
    TOKEN_BUCKET_RATE: {name: 'tokenBucketRate', type: 'i'},              // file and udp reporter
    EC2_METADATA_TIMEOUT: {name: 'ec2MetadataTimeout', type: 'i'},
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
    for (const k in keys) {
      const ak = `APPOPTICS_${k}`;
      if (ak in source) {
        destination[ak] = source[ak];
      } else {
        delete destination[ak];
      }
    }
  }

})
