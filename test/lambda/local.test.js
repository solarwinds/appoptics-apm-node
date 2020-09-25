'use strict';

const nvm_dir = process.env.NVM_DIR;
const version = process.version;
const prefix = process.env.NODE_PATH ? ':' : '';
const globalInstalls = `${prefix}${nvm_dir}/versions/node/${version}/lib/node_modules`;
process.env.NODE_PATH += globalInstalls;

// create a fake lambda environment
process.env.AWS_LAMBDA_FUNCTION_NAME = 'local-test-function';
process.env.LAMBDA_TASK_ROOT = '/var/runtime';
process.env.APPOPTICS_SAMPLE_PERCENT = 100;
process.env.APPOPTICS_LOG_SETTINGS = '';
delete process.env.APPOPTICS_REPORTER;
delete process.env.APPOPTICS_COLLECTOR;

const child_process = require('child_process');
const os = require('os');

const expect = require('chai').expect;
const BSON = require('bson');

const events = require('./v1-v2-events.js');

const xt = 'X-Trace';

// the auto wrapped version invokes the test function that doesn't
// manually wrap the agent.
const autoEntrySpanName = 'nodejs-lambda-agentNotLoaded';

const testFile = './local-tests.js';

const {aoLambdaTest} = require(testFile);


// need to spawn task executing runnable script so stdout/stderr are captured.
// task should be a function in a module that is wrapped by our code.
// the function should execute an async outbound http call and a sync span
// verify that the events are correct (first pass - event count is right)
//   then decode base64/bson events
//

const xTraceS = '2B9F41282812F1D348EE79A1B65F87656AAB20C705D5AD851C0152084301';
const xTraceU = '2B9F41282812F1D348EE79A1B65F87656AAB20C705D5AD851C0152084300';

describe('test lambda promise function\'s core responses with empty events', function () {
  beforeEach(function () {
    process.env.APPOPTICS_ENABLED = 'true';
    process.env.AWS_REGION = randomRegion();
  });

  it('no agent loaded', async function () {
    const test = 'agentNotLoadedP';
    const event = JSON.stringify({});
    const context = randomContext();
    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            expect(k).not.equal('ao-data');
            if (k === 'test-data') {
              const o = obj[k];
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
            }
          }
        }
        return undefined;
      });

  });

  it('agent disabled by configuration file', function () {
    const test = 'agentDisabledP';
    const event = JSON.stringify({});
    const context = randomContext();
    // don't let the env var override the configuration file
    delete process.env.APPOPTICS_ENABLED;

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            expect(k).not.equal('ao-data');
            if (k === 'test-data') {
              const o = obj[k];
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
            }
          }
        }
        return undefined;
      });
  });

  it('agent disabled by environment variable', function () {
    const test = 'agentEnabledP';
    const event = JSON.stringify({});
    const context = randomContext();
    process.env.APPOPTICS_ENABLED = false;

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            expect(k).not.equal('ao-data');
            if (k === 'test-data') {
              const o = obj[k];
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
            }
          }
        }
        return undefined;
      });
  });
});

//=============================================================
//=============================================================
// verify that wrapping the promise functions works as expected.
//=============================================================
//=============================================================
describe('test lambda promise functions with mock apig events', function () {
  beforeEach(function () {
    delete process.env.APPOPTICS_ENABLED;
    process.env.APPOPTICS_LOG_SETTINGS = '';
    process.env.AWS_REGION = randomRegion();
  });

  const tests = [{
    desc: 'apig-${version}${x-trace-clause} should insert x-trace header',
    test: 'agentEnabledP',
    xtrace: xTraceS,
    options: {},
    debug: ['stderr'],
    testDataChecks (o) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).exist;
      expect(o.resolve).property('statusCode').equal(200, 'statusCode should be 200');
      expect(o.resolve).property('headers').property('x-trace');
      expect(o.resolve.headers['x-trace'].slice(2, 42)).equal(xTraceS.slice(2, 42), 'task IDs don\'t match');
      expect(o.resolve.headers['x-trace'].slice(-2)).equal('01', 'sample bit doesn\'t match');
    }
  }, {
    desc: 'apig-${version}${x-trace-clause} should insert x-trace header',
    test: 'agentEnabledP',
    xtrace: xTraceU,
    options: {},
    testDataChecks (o) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).exist;
      expect(o.resolve).property('statusCode').equal(200, 'statusCode should be 200');
      expect(o.resolve).property('headers').property('x-trace');
      expect(o.resolve.headers['x-trace'].slice(2, 42)).equal(xTraceS.slice(2, 42), 'task IDs don\'t match');
      expect(o.resolve.headers['x-trace'].slice(-2)).equal('00', 'sample bit doesn\'t match');
    }
  }, {
    desc: 'apig-${version}${x-trace-clause} don\'t insert x-trace header',
    test: 'agentEnabledP',
    xtrace: undefined,
    options: {},
    testDataChecks (o) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).exist;
      expect(o.resolve).property('statusCode').equal(200, 'statusCode should be 200');
      expect(o.resolve).not.property('headers');
    }
  }, {
    desc: 'apig-${version} invalid v1 response does not generate an error',
    test: 'agentEnabledP',
    xtrace: undefined,
    resolve: 'invalid-resolve-value-for-v1',
    options: {},
    extraAoDataChecks (organized) {
      expect(organized.topEvents.exit).not.property('ErrorClass');
      expect(organized.topEvents.exit).not.property('ErrorMsg');
      expect(organized.topEvents.exit).not.property('Backtrace');
    },
    testDataChecks (o) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).equal(this.resolve);
      expect(o.reject).not.exist;
    }

  }, {
    desc: 'apig-${version} string => body (if v2)${x-trace-clause}',
    test: 'agentEnabledP',
    xtrace: xTraceU,
    resolve: 'string-resolve-value',
    options: {},
    extraAoDataChecks (organized) {
      expect(organized.topEvents).deep.equal({}, 'no topEvents should be present');
    },
    testDataChecks (o, options) {
      const {ev} = options;
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      if (ev === 'v2') {
        expect(o.resolve).property('statusCode', 200);
        expect(o.resolve).property('body', this.resolve);
        expect(o.resolve).property('headers').property('x-trace').match(/2B[0-9A-F]{56}0(0|1)/);
      } else {
        expect(o.resolve).equal(this.resolve);
      }
      expect(o.reject).not.exist;
    }
  }, {
    desc: 'apig-${version} string => body (only v2)${x-trace-clause}',
    test: 'agentEnabledP',
    xtrace: xTraceS,
    resolve: 'string-resolve-value',
    options: {},
    extraAoDataChecks (organized) {
      expect(organized.topEvents).not.deep.equal({}, 'topEvents should be present');
    },
    testDataChecks (o, options) {
      const {ev} = options;
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      if (ev === 'v2') {
        expect(o.resolve).property('statusCode', 200);
        expect(o.resolve).property('body', this.resolve);
        expect(o.resolve).property('headers').property('x-trace').match(/2B[0-9A-F]{56}0(0|1)/);
      } else {
        expect(o.resolve).equal(this.resolve);
      }
      expect(o.reject).not.exist;
    }
  }, {
    desc: 'apig-${version} a string is not modified when no x-trace',
    test: 'agentEnabledP',
    xtrace: undefined,
    resolve: 'string-resolve-value',
    options: {},
    extraAoDataChecks (organized) {
      expect(organized.topEvents.exit).not.property('ErrorClass');
      expect(organized.topEvents.exit).not.property('ErrorMsg');
      expect(organized.topEvents.exit).not.property('Backtrace');
    },
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).equal(this.resolve);
      expect(o.reject).not.exist;
    }
  }, {
    desc: 'apig-${version} obj (no statusCode, v2 only) => body${x-trace-clause}',
    test: 'agentEnabledP',
    xtrace: xTraceU,
    resolve: {i: 'am', a: 'custom', body: 'response'},
    options: {},
    extraAoDataChecks (organized) {
      expect(organized.topEvents).deep.equal({});
    },
    testDataChecks (o, options) {
      const {ev} = options;
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      if (ev === 'v2') {
        expect(o.resolve).property('statusCode', 200);
        expect(o.resolve).property('body', JSON.stringify(this.resolve));
      } else {
        const resolveKeys = Object.keys(this.resolve);
        for (const k of resolveKeys) {
          expect(o.resolve[k]).equal(this.resolve[k]);
        }
      }
      expect(o.resolve).property('headers').property('x-trace').match(/2B[0-9A-F]{56}0(0|1)/);
      expect(o.resolve.headers['x-trace'].slice(-1)).equal(this.xtrace.slice(-1));
      expect(o.reject).not.exist;
    }
  }, {
    desc: 'report statusCode but not error when the function rejects',
    test: 'agentEnabledP',
    xtrace: undefined,
    reject: 404,
    options: {},
    extraAoDataChecks (organized) {
      expect(organized.topEvents.exit).not.property('ErrorClass');
      expect(organized.topEvents.exit).not.property('ErrorMsg');
      expect(organized.topEvents.exit).not.property('Backtrace');
    },
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).not.exist;
      expect(o.reject).exist;
      expect(o.reject.statusCode).equal(this.reject, `errorCode should be ${this.reject}`);
    }

  }, {
    desc: 'report an error when the function throws',
    test: 'agentEnabledP',
    xtrace: undefined,
    throw: 'made up fatal error',
    extraAoDataChecks (organized) {
      const re = new RegExp(`^Error: ${this.throw}\n`);
      expect(organized.topEvents.exit).property('ErrorClass', 'Error');
      expect(organized.topEvents.exit).property('ErrorMsg', this.throw);
      expect(organized.topEvents.exit).property('Backtrace').match(re);
    },
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).not.exist;
      expect(o.reject).exist;
      expect(o.reject).deep.equal({});
    }
  }, {
    desc: 'do not return an x-trace when it throws',
    test: 'agentEnabledP',
    xtrace: xTraceS,
    throw: 'no-xtrace-please',
    extraAoDataChecks (organized) {
      const re = new RegExp(`^Error: ${this.throw}\n`);
      expect(organized.topEvents.exit).property('ErrorClass', 'Error');
      expect(organized.topEvents.exit).property('ErrorMsg', this.throw);
      expect(organized.topEvents.exit).property('Backtrace').match(re);
    },
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).not.exist;
      expect(o.reject).deep.equal({});
    }
  }];

  executeTests(tests);

});

//
// a quick set executing the callback signature.
//
describe('test lambda callback functions with mock apig events', function () {
  beforeEach(function () {
    delete process.env.APPOPTICS_ENABLED;
    process.env.APPOPTICS_LOG_SETTINGS = '';
    process.env.AWS_REGION = randomRegion();
  });

  const tests = [{
    desc: 'apig-${version} callback test${x-trace-clause}',
    test: 'agentEnabledCB',
    xtrace: xTraceS,
    options: {},
    debug: false,
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).exist;
      expect(o.resolve).property('statusCode').equal(200, 'statusCode should be 200');
      expect(o.resolve).property('headers').an('object').property('x-trace');
      expect(o.resolve.headers['x-trace'].slice(2, 42)).equal(this.xtrace.slice(2, 42), 'task IDs don\'t match');
      expect(o.resolve.headers['x-trace'].slice(-1)).equal(this.xtrace.slice(-1), 'sample bit doesn\'t match');
    }
  }];
  executeTests(tests);
});

//
// simulate direct function calls using a non-apig event format.
//
describe('test lambda functions with direct function call', function () {
  beforeEach(function () {
    delete process.env.APPOPTICS_ENABLED;
    process.env.APPOPTICS_LOG_SETTINGS = '';
    process.env.AWS_REGION = randomRegion();
  });

  const tests = [{
    desc: 'simulated invoke(), agent disabled',
    test: 'agentDisabledP',
    events: [{name: 'emptyEvent', e: {}}],
    //xtrace: xTraceS,
    options: {},
    debug: false,
    replaceAoDataChecks (aodata) {
      expect(aodata, 'ao-data should not exist').not.exist;
    },
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).property('statusCode').equal(200);
    }
  }, {
    desc: 'simulated invoke(), agent enabled',
    test: 'agentEnabledP',
    events: [{name: 'emptyEvent', e: {}}],
    options: {},
    debug: false,
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).property('statusCode').equal(200);
      expect(o.resolve).not.property('headers');
    }
  }, {
    desc: 'simulated invoke(), agent enabled, x-trace header sent',
    test: 'agentEnabledP',
    events: [{name: 'xtraceEvent', e: {headers: {'x-trace': xTraceS}, 'x-trace': xTraceS}}],
    options: {},
    debug: false,
    testDataChecks (o, options) {
      expect(o.initialao).equal(false, 'the agent should not have been loaded');
      expect(o.resolve).property('statusCode').equal(200);
      expect(o.resolve).not.property('headers');
    }
  }];

  executeTests(tests);
});

//
// these tests require setting environment variables to the auto-wrapper but
// doesn't try to use the real lambda runtime (/var/runtime/UserFunction)
// module, so apm must load this repo version of apm; there is not one in
// node_modules. and  the runtime is faked by the load function is testFile.
//
// AO_TEST_LAMBDA_APM = '../..'
// AO_TEST_LAMBDA_RUNTIME = require(testFile).runtimeRequirePath;
//
// it loads a real copy of appoptics-auto-lambda but that function uses the
// AO_TEST_ env vars above to load the proper versions for testing.
//
describe('verify auto-wrap function works', function () {
  beforeEach(function () {
    delete process.env.APPOPTICS_WRAP_LAMBDA_HANDLER;
    process.env.AWS_REGION = randomRegion();
  })

  it('should automatically wrap the user function and load APM', function () {
    process.env.AO_TEST_LAMBDA_APM = '../..';
    process.env.AO_TEST_LAMBDA_RUNTIME = require(testFile).runtimeRequirePath;
    delete process.env.APPOPTICS_ENABLED;

    // now set auto-wrap up with the function that doesn't manually wrap the
    // user function.
    process.env.APPOPTICS_WRAP_LAMBDA_HANDLER = `${testFile}.agentNotLoadedP`;

    const ev = 'v1';
    const event = JSON.stringify(events[ev]);
    const context = randomContext();
    const options = {entrySpanName: autoEntrySpanName, ev};

    let aoDataSeen = false;
    let testDataSeen = false;
    return exec(`node -e 'require("appoptics-auto-lambda").handler(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              aoDataSeen = true;
              const aoData = decodeAoData(o);
              const organized = checkAoData(aoData, options);
              organized.metrics.forEach(m => {
                ['measurements', 'histograms'].forEach(k => {
                  //console.log(m[k]);
                })
              });
            } else if (k === 'test-data') {
              testDataSeen = true;
              expect(o.initialao).equal(true, 'the agent should have been loaded');
              expect(o).property('resolve').property('statusCode').equal(200);
            }
          }
        }
        expect(aoDataSeen).equal(true, 'ao-data must be present');
        expect(testDataSeen).equal(true, 'test-data must be present');
        return undefined;
      });
  });

  it('should not wrap when disabled', function () {
    process.env.APPOPTICS_ENABLED = false;
    process.env.AO_TEST_LAMBDA_APM = '../..';
    process.env.AO_TEST_LAMBDA_RUNTIME = require(testFile).runtimeRequirePath;

    // now set auto-wrap up with the function that doesn't manually wrap the
    // user function.
    process.env.APPOPTICS_WRAP_LAMBDA_HANDLER = `${testFile}.agentNotLoadedP`;

    const event = JSON.stringify(events.v1);
    const context = randomContext();

    let aoDataSeen = false;
    let testDataSeen = false;
    return exec(`node -e 'require("appoptics-auto-lambda").handler(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              aoDataSeen = true;
              const aoData = decodeAoData(o);
              const options = {entrySpanName: autoEntrySpanName};
              const organized = checkAoData(aoData, options);
              organized.metrics.forEach(m => {
                ['measurements', 'histograms'].forEach(k => {
                  //console.log(m[k]);
                })
              });
            } else if (k === 'test-data') {
              testDataSeen = true;
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o).property('resolve').property('statusCode').equal(200);
            }
          }
        }
        expect(aoDataSeen).equal(false, 'ao-data must not be present');
        expect(testDataSeen).equal(true, 'test-data must be present');
        return undefined;
      });
  })
})

//
// iterate over the tests executing each one with a rest, v1, and v2 event format or
// a specified set of events.
// test-specific settings are available for test.debug and test.options.
// debug - see t.debug below
// options - {only: true, logging: ['span', 'debug']} defaults are false and [];
//
function executeTests (tests) {
  for (const t of tests) {
    //const testEvents = t.events || ['rest', 'v1', 'v2'];
    const testEvents = t.events || ['rest', 'v1', 'v2'].map(name => {return {name, e: events[name]}});
    for (const info of testEvents) {
      const {name: ev, e} = info;
      const {desc, test, xtrace, logging, options = {}} = t;

      let dbg = {stderr: false, stdout: false, decodeAo: false, checkAo: false};
      if (t.debug === true) {
        dbg = {stderr: true, stdout: true, decodeAo: true, checkAo: true};
      } else if (Array.isArray(t.debug)) {
        t.debug.forEach(d => dbg[d] = true);
      }

      let clause = '';
      const testEvent = clone(e);
      if (xtrace && testEvent.headers) {
        const sampled = xtrace.slice(-1) === '1' ? 'sampled' : 'unsampled';
        clause = ` ${sampled} x-trace`;
        testEvent.headers['x-trace'] = xtrace;
      } else {
        clause = ' no x-trace';
      }

      const description = desc.replace('${version}', ev).replace('${x-trace-clause}', clause);
      const event = JSON.stringify(testEvent);
      const ctxObject = {};
      const ctx = {};
      for (const key of ['resolve', 'reject', 'throw']) {
        if (key in t) {
          ctx[key] = t[key];
        }
      }
      /*
      if ('resolve' in t) {
        ctx.resolve = t.resolve;
      }
      if ('reject' in t) {
        ctx.reject = t.reject;
      }
      if ('throw' in t) {
        ctx.throw = t.throw;
      }
      // */
      if (Object.keys(ctx).length) {
        ctxObject[aoLambdaTest] = ctx;
      }
      const context = randomContext(ctxObject);
      // it's a little kludgy but if the last char of the function is P then it's a promise
      // and if it's a B it's a callback (CB ending).
      const fnName = `fakeLambda${test.slice(-1) === 'P' ? 'Promiser' : 'Callbacker'}`;
      const checkOptions = {fnName, xtrace, ev, context: JSON.parse(context), debug: dbg.checkAo};

      const doit = options.only ? it.only : it;
      doit(description, function () {
        if (logging) {
          process.env.APPOPTICS_LOG_SETTINGS = logging;
        }
        const previousLogging = process.env.APPOPTICS_LOG_SETTINGS;
        if (options.logging) {
          process.env.APPOPTICS_LOG_SETTINGS = options.logging.join(',');
        }
        return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
          .then(r => {
            process.env.APPOPTICS_LOG_SETTINGS = previousLogging;
            expect(checkStderr(r.stderr, dbg.stderr)).equal(undefined);
            const jsonObjs = parseStdout(r.stdout, dbg.stdout);
            for (const obj of jsonObjs) {
              for (const k in obj) {
                const o = obj[k];
                if (k === 'ao-data') {
                  const aodata = decodeAoData(o, dbg.decodeAo);
                  if (t.replaceAoDataChecks) {
                    t.replaceAoDataChecks(aodata);
                  } else {
                    const organized = checkAoData(aodata, checkOptions);
                    if (t.extraAoDataChecks) {
                      t.extraAoDataChecks(organized);
                    }
                  }
                } else if (k === 'test-data') {
                  t.testDataChecks(o, checkOptions);
                }
              }
            }
            return undefined;
          });
      });
    }
  }
}

//
// spawn a child process to execute a command line, returning all statuses in result
//
async function exec (arg) {
  const options = {cwd: './test/lambda'};
  const p = new Promise(resolve => {
    child_process.exec(arg, options, function (err, stdout, stderr) {
      const result = {cmd: arg};
      if (err) result.err = err;
      if (stdout) result.stdout = stdout;
      if (stderr) result.stderr = stderr;
      resolve(result);
    });
  });
  return p;
}

function parseStdout (text, debug) {
  if (text === undefined) {
    return [];
  }
  const good = [];
  const bad = [];
  try {
    const lines = text.split('\n').filter(s => s);
    for (let i = 0; i < lines.length; i++) {
      try {
        good.push(JSON.parse(lines[i]));
      } catch (e) {
        bad.push(lines[i]);
      }
    }
  } catch (e) {
    console.log(text);  // eslint-disable-line no-console
    return [];
  }

  if (bad.length) {
    console.log('bad stdout:', bad);   // eslint-disable-line no-console
  }
  if (debug) {
    console.log(good);    // eslint-disable-line no-console
  }

  return good;
}

// return undefined or the text
function checkStderr (text, debug) {
  if (text === undefined) {
    return undefined;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') continue;
    if (debug) {
      console.log(lines[i]); // eslint-disable-line no-console
    }
    const m = lines[i].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z appoptics:(\S+)/);
    if (!m || m[1] === 'error') {
      return text;
    }
  }
  return undefined;
}

function decodeAoData (data, debug) {
  if (!data) {
    return undefined;
  }
  const keys = Object.keys(data);
  expect(keys).deep.equal(['events', 'metrics']);
  expect(data.events).an('array');
  expect(data.metrics).an('array');

  const decoded = {events: [], metrics: []};

  for (const key of ['events', 'metrics']) {
    for (const e of data[key]) {
      const b = Buffer.from(e, 'base64');
      const parsed = BSON.deserialize(b, {promoteBuffers: true});
      for (const key in parsed) {
        if (parsed[key] instanceof Buffer) {
          parsed[key] = parsed[key].toString('utf8');
        }
      }
      decoded[key].push(parsed);
    }
  }

  if (debug) {
    console.log(decoded);   // eslint-disable-line no-console
  }

  return decoded;
}

//
// verify the ao-data property is correct.
//
// 1. must have an __Init event
// 2. must have an entry and exit event for "entrySpanName"
// 3. the entry and exit events must have a valid x-trace
// 4. the entry and exit events task ids must match
// 5. the exit event's edge must point to the entry
// 6. the entry and exit events must have the same Hostname
// 7. the exit event must have a TransactionName
//
// return ao-data in useful groups
//
//// options:
//  entrySpanName - the name of the entry span
//  xtrace - the inbound xtrace to check entry event against
//
function checkAoData (aoData, options = {}) {
  const {fnName, xtrace, ev, context, debug} = options;
  if (debug) {
    debugger;     // eslint-disable-line
  }
  const sampled = xtrace && xtrace[59] === '1';
  const entrySpanName = `nodejs-lambda-${fnName}`;

  expect(aoData).property('events').an('array');
  expect(aoData.events.length).gte(sampled ? 3 : 1);
  expect(aoData).property('metrics').an('array');
  expect(aoData.metrics.length).gte(1);

  const {events, metrics} = aoData;

  let init;
  const topEvents = {};
  const otherEvents = [];
  for (let i = 0; i < aoData.events.length; i++) {
    if (events[i].__Init) {
      init = events[i];
    } else if (events[i].Layer === entrySpanName) {
      topEvents[events[i].Label] = events[i];
    } else {
      otherEvents.push(events[i]);
    }
  }
  expect(init).exist.an('object', 'missing nodejs:single __Init event');

  if (sampled) {
    expect(topEvents).property('entry').an('object');
    expect(topEvents).property('exit').an('object');

    expect(topEvents.entry).property('Layer', entrySpanName, `missing event: ${entrySpanName}:entry`);
    expect(topEvents.exit).property('Layer', entrySpanName, `missing event: ${entrySpanName}:exit`);

    // if not invoked with an apig event then this is a "raw call", i.e., it is not treated
    // as an aws-lambda:ws trace.
    const apigCall = (ev === 'v1' || ev === 'v2' || ev === 'rest');

    const spec = apigCall ? 'aws-lambda:ws' : 'aws-lambda';
    expect(topEvents.entry).property('Spec', spec);
    expect(topEvents.entry).property('InvocationCount', 1);
    // these are only reported when there is not an inbound x-trace and so a true sample
    // decision is made.
    if (!xtrace) {
      expect(topEvents.entry).property('SampleSource', 1);
      expect(topEvents.entry).property('SampleRate', 1000000);
      expect(topEvents.entry).property('TID');
      expect(topEvents.entry).property('Timestamp_u');
    }
    // the following are taken from context
    expect(topEvents.entry).property('FunctionVersion', context.functionVersion);
    expect(topEvents.entry).property('InvokedFunctionARN', context.invokedFunctionArn);
    expect(topEvents.entry).property('AWSRequestID', context.awsRequestId);
    expect(topEvents.entry).property('MemoryLimitInMB', context.memoryLimitInMB);
    expect(topEvents.entry).property('LogStreamName', context.logStreamName);
    // this should match what is set when this
    expect(topEvents.entry).property('AWSRegion', process.env.AWS_REGION);

    if (apigCall) {
      expect(topEvents.entry).property('HTTPMethod', getMethod(ev));
      expect(topEvents.entry).property('Hostname', os.hostname());
      expect(topEvents.entry).property('HTTP-Host', 'úüỏ.macnaughton.zone', 'use Host header');
    }

    expect(topEvents.exit).property('TransactionName', `${getMethod(ev)}.${fnName}`);
    expect(topEvents.exit).property('TID');

    expect(topEvents.entry).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
    expect(topEvents.exit).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);

    if (xtrace) {
      expect(topEvents.entry[xt].slice(2, 42)).equal(xtrace.slice(2, 42), 'task ID must match inbound x-trace');
      expect(topEvents.entry).property('Edge', xtrace.slice(42, 58), 'topEvent.entry doesn\'t edge back to xtrace');
    }

    expect(topEvents.entry[xt].slice(2, 42)).equal(topEvents.exit[xt].slice(2, 42), 'task IDs don\'t match');
    expect(topEvents.exit).property('Edge', topEvents.entry[xt].slice(42, 58), 'edge doesn\'t point to entry');
    expect(topEvents.entry).property('Hostname');
    expect(topEvents.entry.Hostname).equal(topEvents.exit.Hostname, 'Hostname doesn\'t match');
    expect(topEvents.exit).property('TransactionName');
  }

  return {init, topEvents, otherEvents, metrics};
}

function getMethod (ev) {
  if (ev === 'v1' || ev === 'rest') {
    return events[ev].httpMethod.toUpperCase();
  } else if (ev === 'v2') {
    return events.v2.requestContext.http.method.toUpperCase();
  } else {
    throw new Error(`${ev} is not recognized`)
  }
}

// https://stackoverflow.com/questions/4459928/how-to-deep-clone-in-javascript
function clone (obj, hash = new WeakMap()) {
  if (Object(obj) !== obj) return obj;      // primitives
  if (hash.has(obj)) return hash.get(obj);  // cyclic reference
  let result;

  if (obj instanceof Set) {
    result = new Set(obj);                  // treat set as a value
  } else if (obj instanceof Map) {
    result = new Map(Array.from(obj, ([key, val]) => [key, clone(val, hash)]));
  } else if (obj instanceof Date) {
    result = new Date(obj);
  } else if (obj instanceof RegExp) {
    result = new RegExp(obj.source, obj.flags);
  } else if (obj.constructor) {
    result = new obj.constructor();
  } else {
    result = Object.create(null);
  }
  hash.set(obj, result);
  return Object.assign(result, ...Object.keys(obj).map(key => {
    return {[key]: clone(obj[key], hash)};
  }));
}

function randomRegion () {
  const regions = [
    'us-east-2',
    'us-east-1',
    'us-west-1',
    'us-west-2',
    'af-south-1',
    'ap-east-1',
    'ap-south-1',
    'ap-northeast-3',
    'ap-northeast-2',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-northeast-1',
    'ca-central-1',
    'cn-north-1',
    'cn-northwest-1',
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-south-1',
    'eu-west-3',
    'eu-north-1',
    'me-south-1',
    'sa-east-1',
    'us-gov-east-1',
  ];
  return regions[Math.floor(Math.random() * regions.length)];
}

function randomContext (predefined) {
  const context = {
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:858939916050:function:f2-node-bam',
    awsRequestId: 'a704f0cd-645e-4fb4-8a6b-fa1416aa2e61',
    memoryLimitInMB: '128',
    logStreamName: '2020/09/24/[$LATEST]b3f0e39b1c034ea6bc48f7388f132d92',
  };

  return JSON.stringify(Object.assign(context, predefined));
}
