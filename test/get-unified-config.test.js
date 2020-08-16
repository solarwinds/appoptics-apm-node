'use strict'

const fs = require('fs');

const expect = require('chai').expect;

const relativeDir = '..';
const guc = require(`${relativeDir}/lib/get-unified-config`);

//
// expected results when neither a config file nor environment variables are present.
//
const expectedGlobalDefaults = {
  enabled: true,
  serviceKey: '',
  triggerTraceEnabled: true,
  traceMode: 1,
  logLevel: 2,
  runtimeMetrics: true,
  unifiedLogging: 'preferred',
}

const expectedProbeDefaults = require(`${relativeDir}/lib/probe-defaults`);

// reference to the object returned by guc().

//const emptyConfig = {
//  file: '',                           // the resolved configuration file path
//  global: {},                         // the top-level configuration items
//  unusedConfig: [],                   // parts of the global configuration that weren't used
//  unusedEnvVars: [],                  // environment variables starting with APPOPTICS_ that weren't used
//  probes: {},                         // probe settings
//  unusedProbes: [],                   // probes in the configuration file that weren't used
//  transactionSettings: undefined,     // special settings based on transaction type
//  settingsErrors: [],                 // errors parsing/handling transactionSettings
//  errors: [],                         // general errors
//  warnings: [],                       // general warnings
//}

const rootConfigName = `${process.cwd()}/appoptics-apm-config`;

//
// core function to check results
//
function doChecks (cfg, overrides = {}) {
  let expected;

  expected = overrides.file || rootConfigName;
  expect(cfg.file).equal(expected);

  expected = Object.assign({}, expectedGlobalDefaults, overrides.global);
  // special to allow undefined serviceKey/serviceName to remove key
  if (expected.serviceKey === undefined) delete expected.serviceKey;
  if (expected.serviceName === undefined) delete expected.serviceName;
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

  expected = overrides.transactionSettings;
  expect(cfg.transactionSettings).deep.equal(expected, 'transactionSettings mismatch');

  expected = overrides.settingsErrors || [];
  expect(cfg.settingsErrors).an('array').deep.equal(expected, 'settingsErrors mismatch');

  expected = overrides.fatals || ['not a valid serviceKey: '];
  expect(cfg.fatals).an('array').deep.equal(expected, 'fatals mismatch');

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

function writeConfigJs (text) {
  fs.writeFileSync(`${rootConfigName}.js`, text, 'utf8');
}

function toInternalTransactionSettings (settings) {
  if (!Array.isArray(settings)) {
    settings = [settings];
  }
  const translated = [];

  settings.forEach(s => {
    translated.push({
      doMetrics: s.tracing !== 'disabled',
      doSample: s.tracing !== 'disabled',
      string: s.string,
      regex: s.regex,
      type: s.type,
    });
    if (typeof s.regex === 'string') {
      translated[translated.length - 1].regex = new RegExp(s.regex);
    }
  });

  return translated;
}

function toTransactionSettingsError (settings, message) {
  return {
    error: message,
    spec: settings
  }
}


//==============
// start testing
//==============
describe('get-unified-config', function () {
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
    delete process.env.LAMBDA_TASK_ROOT;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;

    // remove any files created with the default names
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
      domainPrefix: false,
    }
    writeConfigJSON(config);
    const cfg = guc();

    const expected = Object.assign({}, config, {serviceKey: ''});
    const fatals = [`not a valid serviceKey: ${'f'.repeat(64)}`];
    doChecks(cfg, {global: expected, fatals});
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

  it('should handle benchmark config file', function () {
    const literal = [
      'let serviceKey;',
      '',
      'module.exports = {',
      '  enabled: true,',
      '  traceMode: 1,',
      '  hostnameAlias: \'\',',
      '  domainPrefix: false,',
      '  serviceKey,',
      '  insertTraceIdsIntoLogs: undefined,',
      '  insertTraceIdsIntoMorgan: undefined,',
      '  createTraceIdsToken: false,',
      '  probes: {',
      '    fs: {',
      '      enabled: true',
      '    }',
      '  }',
      '};',
    ];
    const expected = {
      enabled: true,
      traceMode: 1,
      hostnameAlias: '',
      domainPrefix: false,
      serviceKey: '',
      insertTraceIdsIntoLogs: false,
      insertTraceIdsIntoMorgan: false,
    };

    writeConfigJs(literal.join('\n'));

    // specify the filename with extension to work around node bug/feature/issue.
    const file = process.env.APPOPTICS_APM_CONFIG_NODE = 'appoptics-apm-config.js';

    const cfg = guc();

    const warnings = [
      'invalid configuration file value createTraceIdsToken: false',
      'traceMode is deprecated; it will be invalid in the future',
    ];
    const overrides = {
      file: `${process.cwd()}/${file}`,
      global: expected,
      fatals: ['not a valid serviceKey: undefined'],
      warnings,
    };
    doChecks(cfg, overrides);
  })

  it('should handle a non-default config file correctly', function () {
    const config = {ec2MetadataTimeout: 4000};
    const filename = 'non-default.json';
    fs.writeFileSync(filename, JSON.stringify(config));

    process.env.APPOPTICS_APM_CONFIG_NODE = filename;

    const cfg = guc();

    fs.unlinkSync(filename);

    doChecks(cfg, {file: `${process.cwd()}/${filename}`, global: config});
  })

  //
  // config file errors
  //
  it('should correctly report an error reading a non-default config file', function () {
    const file = process.env.APPOPTICS_APM_CONFIG_NODE = 'xyzzy-bruce.json';
    const fullpath = `${process.cwd()}/${file}`;

    const cfg = guc();

    const message = `Cannot find module '${fullpath}'`;
    const errors = [`Cannot read config file ${fullpath}: ${message}`];
    doChecks(cfg, {file: fullpath, errors});
  })

  it('should correctly report an error reading a bad config file', function () {
    writeConfigLiteral('{"i am: bad\n');

    const cfg = guc();

    const message = 'Unexpected token \n in JSON at position 11';
    const errors = [`Cannot read config file ${rootConfigName}: ${rootConfigName}.json: ${message}`];
    doChecks(cfg, {errors});
  });

  //
  // env vars
  //
  it('should warn about unknown APPOPTICS_ environment variables', function () {
    process.env.APPOPTICS_YINYIN_ROCKS = 'truth';

    const cfg = guc();

    const unusedEnvVars = ['APPOPTICS_YINYIN_ROCKS=truth'];
    doChecks(cfg, {unusedEnvVars});
  })

  it('should not use invalid env var values', function () {
    process.env.APPOPTICS_EC2_METADATA_TIMEOUT = 'xyzzy';
    process.env.APPOPTICS_UNIFIED_LOGGING = 'maybe';

    const cfg = guc();

    const warnings = [
      'invalid environment variable value APPOPTICS_EC2_METADATA_TIMEOUT=xyzzy',
      'invalid environment variable value APPOPTICS_UNIFIED_LOGGING=maybe',
    ];
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

  it('should override config file keys when environment variables are present', function () {
    const config = {
      enabled: false,
      hostnameAlias: 'bruce',
      serviceKey: 'f'.repeat(64),
      ignoreConflicts: true,
      domainPrefix: false,
      unifiedLogging: 'never',
    }
    writeConfigJSON(config);
    process.env.APPOPTICS_SERVICE_KEY = 'ab'.repeat(32);
    process.env.APPOPTICS_HOSTNAME_ALIAS = 'macnaughton';
    process.env.APPOPTICS_UNIFIED_LOGGING = 'always';

    const cfg = guc();

    config.hostnameAlias = process.env.APPOPTICS_HOSTNAME_ALIAS;
    config.serviceKey = process.env.APPOPTICS_SERVICE_KEY;
    config.unifiedLogging = process.env.APPOPTICS_UNIFIED_LOGGING;

    const expected = Object.assign(config, {serviceKey: ''});
    doChecks(cfg, {global: expected, fatals: [`not a valid serviceKey: ${'ab'.repeat(32)}`]});
  })

  it('should use environment variables when the config file is invalid', function () {
    writeConfigLiteral('{"i am: bad\n');
    process.env.APPOPTICS_SERVICE_KEY = `${'ac'.repeat(32)}:valid-service-key`;

    const cfg = guc();

    const message = 'Unexpected token \n in JSON at position 11';
    const errors = [
      `Cannot read config file ${rootConfigName}: ${rootConfigName}.json: ${message}`,
    ];
    // it's a valid service key so clear fatals which expects an invalid key
    const fatals = [];
    doChecks(cfg, {global: {serviceKey: process.env.APPOPTICS_SERVICE_KEY}, errors, fatals});
  });

  it('should correctly handle env vars with explicit names', function () {
    process.env.APPOPTICS_DEBUG_LEVEL = 4;
    process.env.APPOPTICS_COLLECTOR = 'collector-stg.appoptics.com';
    process.env.APPOPTICS_TRUSTEDPATH = './certs/special.cert';

    const cfg = guc();

    const expectedLogLevel = +process.env.APPOPTICS_DEBUG_LEVEL;
    const config = {
      logLevel: expectedLogLevel,
      endpoint: process.env.APPOPTICS_COLLECTOR,
      trustedPath: process.env.APPOPTICS_TRUSTEDPATH,
    };
    doChecks(cfg, {global: config});
  })

  it('should map an env var name to a different property name', function () {
    process.env.APPOPTICS_TRIGGER_TRACE = 'disabled';

    const cfg = guc();

    const config = {triggerTraceEnabled: false};
    const warnings = ['APPOPTICS_TRIGGER_TRACE is deprecated; it will be invalid in the future'];
    doChecks(cfg, {global: config, warnings});
  })

  //
  // probes
  //
  it('should set probe values correctly', function () {
    const config = {probes: {fs: {enabled: false, bruce: 'says hello'}}};
    writeConfigJSON(config);

    const cfg = guc();

    doChecks(cfg, {probes: config.probes});
  })

  it('should not set keys for unknown probes', function () {
    const config = {probes: {xyzzy: {enabled: true, collectBacktraces: false}}};
    writeConfigJSON(config);

    const cfg = guc();

    doChecks(cfg, {unusedProbes: [config.probes]});
  })

  it('should handle an fs probe\'s ignoreErrors property', function () {
    const config = {probes: {fs: {enabled: true, ignoreErrors: {open: {ENOENT: true}}}}};
    writeConfigJSON(config);

    const cfg = guc();

    doChecks(cfg, {probes: config.probes});
  })

  it('should verify an fs probe\'s ignoreErrors value is an object', function () {
    const config = {probes: {fs: {enabled: true, ignoreErrors: 'i am a shrimp'}}};
    writeConfigJSON(config);

    const cfg = guc();

    const errors = [
      `invalid ignoreErrors setting: ${JSON.stringify('i am a shrimp')}`,
    ];
    delete config.probes.fs.ignoreErrors;
    doChecks(cfg, {probes: config.probes, errors});
  })

  it('should verify that an fs probe\'s ignoreErrors object contains objects', function () {
    const config = {probes: {fs: {ignoreErrors: {open: {ENOENT: true}, readdir: 'and so am i'}}}};
    writeConfigJSON(config);

    const cfg = guc();

    const errors = [
      `invalid error code to ignore: ${JSON.stringify({readdir: 'and so am i'})}`
    ];
    delete config.probes.fs.ignoreErrors.readdir;
    doChecks(cfg, {probes: config.probes, errors});

  })

  //
  // verify that a misisng serviceKey is handled correctly.
  //

  it('an invalid serviceKey in a non-lambda environment is a fatal error', function () {
    const serviceKey = `${'f'.repeat(32)}:service-name`;
    process.env.APPOPTICS_SERVICE_KEY = serviceKey;

    const cfg = guc();

    // the serviceKey is not valid and should be reported
    const fatals = [`not a valid serviceKey: ${serviceKey}`];
    const expected = Object.assign({global: {serviceName: undefined, serviceKey: ''}, fatals});
    doChecks(cfg, expected);
  });

  //
  // transaction settings
  //
  it('should allow JSON x-action settings', function () {
    const config = {transactionSettings: [
      {type: 'url', string: '/xy(zzy', tracing: 'disabled'},
      {type: 'url', regex: 'xyzzy', tracing: 'disabled'},
      {type: 'url', string: 'plover', tracing: 'enabled'},
    ]};
    writeConfigJSON(config);

    const cfg = guc();

    const transactionSettings = toInternalTransactionSettings(config.transactionSettings);
    doChecks(cfg, {transactionSettings});
  })

  it('should not allow an invalid regex in JSON x-action settings', function () {
    const config = {
      transactionSettings: [
        {type: 'url', regex: '/xy(zzy', tracing: 'disabled'}
      ]
    };
    writeConfigJSON(config);

    const cfg = guc();

    const msg = 'Invalid regular expression: //xy(zzy/: Unterminated group';
    const settingsErrors = [toTransactionSettingsError(config.transactionSettings[0], msg)];
    doChecks(cfg, {settingsErrors});
  })

  it('should allow a RegExp in module-based x-action settings', function () {
    const config = {transactionSettings: [
      {type: 'url', regex: /xyzzy/, tracing: 'disabled'},
      {type: 'url', regex: 'hello', tracing: 'disabled'},
      {type: 'url', string: '/xy(zzy', tracing: 'disabled'},
    ]};
    const literal = [
      'module.exports = {transactionSettings: [',
      '  {type: "url", regex: /xyzzy/, tracing: "disabled"},',
      '  {type: "url", regex: "hello", tracing: "disabled"},',
      '  {type: "url", string: "/xy(zzy", tracing: "disabled"},',
      ']}', ''
    ];
    writeConfigJs(literal.join('\n'));

    // specify the filename with extension to work around node bug/feature/issue.
    const file = process.env.APPOPTICS_APM_CONFIG_NODE = 'appoptics-apm-config.js';

    const cfg = guc();

    const transactionSettings = toInternalTransactionSettings(config.transactionSettings);
    doChecks(cfg, {file: `${process.cwd()}/${file}`, transactionSettings});
  })

  it('should report invalid transactionSettings entries', function () {
    const config = {transactionSettings: [
      {type: 'z'},
      {regex: 17},
      {type: 'url', regex: 'hello'},
      {type: 'url', string: 'hello', tracing: 'invalid'},
      {type: 'url', tracing: 'enabled'},
      {type: 'url', regex: 'not-real-regex', string: 'i am a string'},
    ]}
    writeConfigJSON(config);

    const cfg = guc();

    const settingsErrors = [
      toTransactionSettingsError(config.transactionSettings[0], 'invalid type: "z"'),
      toTransactionSettingsError(config.transactionSettings[1], 'invalid type: "undefined"'),
      toTransactionSettingsError(config.transactionSettings[2], 'invalid tracing value: "undefined"'),
      toTransactionSettingsError(config.transactionSettings[3], 'invalid tracing value: "invalid"'),
      toTransactionSettingsError(config.transactionSettings[4], 'must specify one, not both, of "string" and "regex"'),
      toTransactionSettingsError(config.transactionSettings[5], 'must specify one, not both, of "string" and "regex"'),
    ];

    doChecks(cfg, {settingsErrors});
  })

  it('should allow a single transactionSettings entry', function () {
    const config = {transactionSettings: {type: 'url', string: 'i\'m a shrimp', tracing: 'disabled'}};
    writeConfigJSON(config);

    const cfg = guc();

    const transactionSettings = toInternalTransactionSettings(config.transactionSettings);
    doChecks(cfg, {transactionSettings});
  })

})
