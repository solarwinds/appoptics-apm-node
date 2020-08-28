'use strict';

const nvm_dir = process.env.NVM_DIR;
const version = process.version;
const prefix = process.env.NODE_PATH ? ':' : '';
const globalInstalls = `${prefix}${nvm_dir}/versions/node/${version}/lib/node_modules`;
process.env.NODE_PATH += globalInstalls;

// create a fake lambda environment
process.env.AWS_LAMBDA_FUNCTION_NAME = 'local-test-function';
process.env.LAMBDA_TASK_ROOT = '/var/runtime';
delete process.env.APPOPTICS_REPORTER;
delete process.env.APPOPTICS_COLLECTOR;

const child_process = require('child_process');
const expect = require('chai').expect;

const BSON = require('bson');


const xt = 'X-Trace';
const entrySpanName = 'nodejs-lambda-fakeLambdaPromiser';
const testFile = './local-tests.js';

// need to spawn task executing runnable script so stdout/stderr are captured.
// task should be a function in a module that is wrapped by our code.
// the function should execute an async outbound http call and a sync span
// verify that the events are correct (first pass - event count is right)
//   then decode base64/bson events
//

const xTraceS = '2B9F41282812F1D348EE79A1B65F87656AAB20C705D5AD851C0152084301';
const xTraceU = '2B9F41282812F1D348EE79A1B65F87656AAB20C705D5AD851C0152084300';

describe('execute lambda promise-functions with a simulated api gateway event', function () {
  beforeEach(function () {
    this.timeout(20000);
  })

  it('should work without the agent being loaded', async function () {
    const test = 'agentNotLoaded';
    const event = JSON.stringify({});
    const context = JSON.stringify({});

    return exec(`node -e "require('${testFile}').${test}(${event}, ${context})"`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            expect(k).not.equal('ao-data');
            const o = obj[k];
            if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
            }
          }
        }
        return undefined;
      });

  });

  it('should work with the agent disabled', function () {
    const test = 'agentDisabled';
    const event = JSON.stringify({});
    const context = JSON.stringify({});

    return exec(`node -e "require('${testFile}').${test}(${event}, ${context})"`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            expect(k).not.equal('ao-data');
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
            }
          }
        }
        return undefined;
      });


  });

  it('should work with the agent enabled', function () {
    const test = 'agentEnabled';
    const event = JSON.stringify({});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              const aoData = decodeAoData(o);
              const organized = checkAoData(aoData);
              organized.metrics.forEach(m => {
                ['measurements', 'histograms'].forEach(k => {
                  //console.log(m[k]);
                })
              });
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o).property('resolve').property('statusCode').equal(200);
              expect(o.resolve).property('statusCode').equal(200);
            }
          }
        }
        return undefined;
      });
  });

  it('should not report an error when the function rejects', function () {
    const test = 'agentEnabled';
    const errorCode = 404;
    const event = JSON.stringify({reject: errorCode});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              const aodata = decodeAoData(o);
              const organized = checkAoData(aodata);
              expect(organized.topEvents.exit).not.property('ErrorClass');
              expect(organized.topEvents.exit).not.property('ErrorMsg');
              expect(organized.topEvents.exit).not.property('Backtrace');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).not.exist;
              expect(o.reject).exist;
              expect(o.reject.statusCode).equal(errorCode, `errorCode should be ${errorCode}`);
            }
          }
        }
        return undefined;
      });
  });

  it('should report an error when the function throws', function () {
    const test = 'agentEnabled';
    const emsg = 'fatal error';
    const re = new RegExp(`^Error: ${emsg}\n`);
    const event = JSON.stringify({throw: emsg});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              const aodata = decodeAoData(o);
              const organized = checkAoData(aodata);
              expect(organized.topEvents.exit).property('ErrorClass', 'Error');
              expect(organized.topEvents.exit).property('ErrorMsg', emsg);
              expect(organized.topEvents.exit).property('Backtrace').match(re);
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).not.exist;
              expect(o.reject).exist;
              expect(o.reject).deep.equal({});
            }
          }
        }
        return undefined;
      });
  });

  it('should not return an x-trace header when it throws', function () {
    const test = 'agentEnabled';
    const emsg = 'fatal error';
    const re = new RegExp(`^Error: ${emsg}\n`);
    const event = JSON.stringify({throw: emsg, headers: {'x-trace': xTraceS}});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              const aodata = decodeAoData(o);
              const organized = checkAoData(aodata);
              expect(organized.topEvents.exit).property('ErrorClass', 'Error');
              expect(organized.topEvents.exit).property('ErrorMsg', emsg);
              expect(organized.topEvents.exit).property('Backtrace').match(re);
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).not.exist;
              expect(o.reject).deep.equal({});
            }
          }
        }
        return undefined;
      });
  });

  it('should work when a sampled x-trace header is supplied', function () {
    const test = 'agentEnabled';
    const event = JSON.stringify({headers: {'x-trace': xTraceS}});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).exist;
              expect(o.resolve.statusCode).equal(200, 'statusCode should be 200');
              expect(o.resolve.headers).property('x-trace');
              expect(o.resolve.headers['x-trace'].slice(2, 42)).equal(xTraceS.slice(2, 42), 'task IDs don\'t match');
              expect(o.resolve.headers['x-trace'].slice(-2)).equal('01', 'sample bit doesn\'t match');
            }
          }
        }
        return undefined;
      });
  });

  it('should work when an unsampled x-trace header is supplied', function () {
    const test = 'agentEnabled';
    const event = JSON.stringify({headers: {'x-trace': xTraceU}});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).exist;
              expect(o.resolve.statusCode).equal(200, 'statusCode should be 200');
              expect(o.resolve.headers).property('x-trace');
              expect(o.resolve.headers['x-trace'].slice(2, 42)).equal(xTraceU.slice(2, 42), 'task IDs don\'t match');
              expect(o.resolve.headers['x-trace'].slice(-2)).equal('00', 'sample bit doesn\'t match');
            }
          }
        }
        return undefined;
      });
  });
});


describe('execute lambda callback-functions with a simulated api gateway event', function () {

  it('should work when a sampled x-trace header is supplied', function () {
    const test = 'agentEnabledCB';
    const event = JSON.stringify({headers: {'x-trace': xTraceS}});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).exist;
              expect(o.resolve.statusCode).equal(200, 'statusCode should be 200');
              expect(o.resolve.headers).property('x-trace');
              expect(o.resolve.headers['x-trace'].slice(2, 42)).equal(xTraceS.slice(2, 42), 'task IDs don\'t match');
              expect(o.resolve.headers['x-trace'].slice(-2)).equal('01', 'sample bit doesn\'t match');
            } else {
              // eslint-disable-next-line no-console
              console.log('unexpected:', o);
            }
          }
        }
        return undefined;
      });
  });

});

describe('execute lambda functions with a direct function call', function () {
  beforeEach(function () {
    this.timeout(20000);
  });

  it('should work with the agent disabled', function () {
    const test = 'agentDisabled';
    const event = JSON.stringify({});
    const context = JSON.stringify({});

    return exec(`node -e "require('${testFile}').${test}(${event}, ${context})"`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              expect(k).not.equal('ao-data', 'there should not be an "ao-data" key in the log');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
            }
          }
          return undefined;
        }
      });
  });

  it('should work with the agent enabled', function () {
    const test = 'agentEnabled';
    const event = JSON.stringify({});
    const context = JSON.stringify({});

    return exec(`node -e 'require("${testFile}").${test}(${event}, ${context})'`)
      .then(r => {
        expect(checkStderr(r.stderr)).equal(undefined);
        const jsonObjs = parseStdout(r.stdout);
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              const aoData = decodeAoData(o);
              const organized = checkAoData(aoData);
              organized.metrics.forEach(m => {
                ['measurements', 'histograms'].forEach(k => {
                  //console.log(m[k]);
                })
              });
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'the agent should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
              expect(o.resolve).property('headers').property('x-trace').match(/2B[0-9A-F]{56}01/);
            }
          }
        }
        return undefined;
      });
  });

});


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
    if (debug) console.log(lines[i]); // eslint-disable-line no-console
    const m = lines[i].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z appoptics:(\S+)/);
    if (!m || m[1] === 'error') {
      return text;
    }
  }
  return undefined;
}

function decodeAoData (data, debug) {
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
function checkAoData (aoData, checks) {
  expect(aoData.events.length).gte(3);
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
  expect(init, 'missing nodejs:single __Init event');

  expect(topEvents).property('entry').an('object');
  expect(topEvents).property('exit').an('object');

  expect(topEvents.entry).property('Layer', entrySpanName, `missing event: ${entrySpanName}:entry`);
  expect(topEvents.exit).property('Layer', entrySpanName, `missing event: ${entrySpanName}:exit`);

  expect(topEvents.entry).property('Spec', 'lambda');
  expect(topEvents.entry).property('InvocationCount', 1);
  expect(topEvents.entry).property('SampleSource', 1);
  expect(topEvents.entry).property('SampleRate', 1000000);
  expect(topEvents.entry).property('TID');
  expect(topEvents.entry).property('Timestamp_u');
  expect(topEvents.entry).property('Hostname');

  expect(topEvents.exit).property('TransactionName', `custom-${entrySpanName}`);
  expect(topEvents.exit).property('TID');
  expect(topEvents.exit).property('Timestamp_u');
  expect(topEvents.exit).property('Hostname');

  expect(topEvents.entry).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
  expect(topEvents.exit).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);

  expect(topEvents.entry[xt].slice(2, 42)).equal(topEvents.exit[xt].slice(2, 42), 'task IDs don\'t match');
  expect(topEvents.exit.Edge).equal(topEvents.entry[xt].slice(42, 58), 'edge doesn\'t point to entry');
  expect(topEvents.entry).property('Hostname');
  expect(topEvents.entry.Hostname).equal(topEvents.exit.Hostname, 'Hostname doesn\'t match');
  expect(topEvents.exit).property('TransactionName');

  return {init, topEvents, otherEvents, metrics};
}
