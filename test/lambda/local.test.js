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


const entrySpanName = 'node-lambda-span';
const testFile = './local-tests.js';

// need to spawn task executing runnable script so stdout/stderr are captured.
// task should be a function in a module that is wrapped by our code.
// the function should execute an async outbound http call and a sync span
// verify that the events are correct (first pass - event count is right)
//   then decode base64/bson events
//

const xTraceS = '2B9F41282812F1D348EE79A1B65F87656AAB20C705D5AD851C0152084301';
const xTraceU = '2B9F41282812F1D348EE79A1B65F87656AAB20C705D5AD851C0152084300';

describe('execute lambda functions with a simulated api gateway event', function () {
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
        const jsonObjs = r.stdout.split('\n').filter(s => s).map(s => JSON.parse(s));
        for (const obj of jsonObjs) {
          for (const k in obj) {
            expect(k).not.equal('ao-data');
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'ao should not have been loaded');
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
        const jsonObjs = r.stdout.split('\n').filter(s => s).map(s => JSON.parse(s));
        for (const obj of jsonObjs) {
          for (const k in obj) {
            expect(k).not.equal('ao-data');
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'ao should not have been loaded');
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
        const jsonObjs = r.stdout.split('\n').filter(s => s).map(s => JSON.parse(s));
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              const aoData = decodeAoData(o);
              const organized = checkAoData(aoData);
              organized.metrics.forEach(m => {
                ['measurements', 'histograms'].forEach(k => {
                  console.log(m[k], m[k].tags ? m[k].tags : '');
                })
              });
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'ao should not have been loaded');
              expect(o.resolve).property('statusCode').equal(200);
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
        const jsonObjs = r.stdout.split('\n').filter(s => s).map(s => JSON.parse(s));
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'ao should not have been loaded');
              expect(o.resolve);
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
        const jsonObjs = r.stdout.split('\n').filter(s => s).map(s => JSON.parse(s));
        for (const obj of jsonObjs) {
          for (const k in obj) {
            const o = obj[k];
            if (k === 'ao-data') {
              expect(o).property('events').an('array');
              expect(o).property('metrics').an('array');
            } else if (k === 'test-data') {
              expect(o.initialao).equal(false, 'ao should not have been loaded');
              expect(o.resolve);
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

// return undefined or the text
function checkStderr (text, debug) {
  if (text === undefined) {
    return undefined;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') continue;
    if (debug) console.log(lines[i]); // eslint-disable-line no-console
    if (!lines[i].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z appoptics:/)) {
      return text;
    }
  }
  return undefined;
}

function decodeAoData (data) {
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

  return decoded;
}

function checkAoData (aoData, checks) {
  expect(aoData.events.length).gte(3);
  expect(aoData.metrics.length).gte(1);

  const xt = 'X-Trace';

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
  expect(init, 'missing an __Init event');

  expect(topEvents.entry).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
  expect(topEvents.exit).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);

  expect(topEvents.entry[xt].slice(2, 42)).equal(topEvents.exit[xt].slice(2, 42), 'task IDs don\'t match');
  expect(topEvents.exit.Edge).equal(topEvents.entry[xt].slice(42, 58), 'edge doesn\'t point to entry');
  expect(topEvents.entry).property('Hostname');
  expect(topEvents.entry.Hostname).equal(topEvents.exit.Hostname, 'Hostname doesn\'t match');
  expect(topEvents.exit).property('TransactionName');

  return {init, topEvents, otherEvents, metrics};
}
