'use strict'

const helper = require('../helper')
const {ao} = require('../1.test-common')
const expect = require('chai').expect
const addon = ao.addon
const testdebug = ao.logger.make('testdebug');

const http = require('http');
const axios = require('axios');
const hmacSha1 = require('crypto-js/hmac-sha1');
const hashToHex = require('crypto-js/enc-hex').stringify;

// test definitions.
//
// desc [string] - description of test for `it('should ${test.desc}, ...)`.
// options [string] - the x-trace-options header
// ts [optional string] - at test execution, replaces '${ts}' in the options header with a unix timestamp
// sample [boolean] - the request should be sampled, so check for correct UDP messages
// sig [optional string] - 'bad' => bad key, 'good' => good key, else no signature
// setup, teardown [optional function] - if present execute at start and end of test
// expected [string] - response expected in x-trace-options-response
// expectedKeys [object] - KV pairs must be present in entry event message.
//

const mockToken = '8mZ98ZnZhhggcsUmdMbS';       // built-in secret key for udp/file reporters
const badMockToken = 'xyzzyadventuredragon';    // any secret key that isn't the same as above
const pdKeysValue = 'lo:se,check-id:123';       // some "standard" values. well, before adding tests.
const signedCustomKey = 'custom-1';             // ditto
const signedCustomValue = 'One';                // ditto
const ttKey = {TriggeredTrace: true};
const oa = Object.assign;                       // shorthand
const erStack = [];                             // a stack to enable and restore config state.

/* eslint-disable max-len */

//
// the test definitions
//
const tests = [
  {desc: 'handle a valid x-trace-options header',
    options: 'trigger-trace;custom-something=value;custom-OtherThing=other val;pd-keys=029734wr70:9wqj21,0d9j1',
    sample: true,
    expected: 'trigger-trace=ok',
    expectedKeys: oa({'PDKeys': '029734wr70:9wqj21,0d9j1', 'custom-something': 'value', 'custom-OtherThing': 'other val'}, ttKey)},
  {desc: 'remove leading/trailing spaces',
    options: 'custom-something=value; custom-OtherThing = other val ;pd-keys=029734wr70:9wqj21,0d9j1',
    sample: true,
    expected: 'trigger-trace=not-requested',
    expectedKeys: {PDKeys: '029734wr70:9wqj21,0d9j1', 'custom-something': 'value', 'custom-OtherThing': 'other val'}},
  {desc: 'report and log ignored keys',
    options: 'what_is_this=value_thing;and_that=otherval;whoot',
    sample: true,       // TODO BAM may need to check return of getTracingDecisions() to know what to do
    expected: 'trigger-trace=not-requested;ignored=what_is_this,and_that,whoot',
    expectedKeys: {}},
  {desc: 'ignore and report trigger-trace with a value',
    options: 'trigger-trace=1;custom-something=value_thing',
    sample: true,       // ditto
    expected: 'trigger-trace=not-requested;ignored=trigger-trace',
    expectedKeys: {'custom-something': 'value_thing'}},
  {desc: 'keep the value of the first repeated key',
    options: 'custom-something=keep_this_0;pd-keys=keep_this;pd-keys=029734wrqj21,0d9;custom-something=otherval',
    sample: true,
    expected: 'trigger-trace=not-requested',
    expectedKeys: {'custom-something': 'keep_this_0', PDKeys: 'keep_this'}},
  {desc: 'keep a value that includes ‘=’',
    options: 'trigger-trace;custom-something=value_thing=4;custom-OtherThing=other val',
    sample: true,
    expected: 'trigger-trace=ok',
    expectedKeys: oa({'custom-something': 'value_thing=4', 'custom-OtherThing': 'other val'}, ttKey)},
  {desc: 'ignore quotes',
    options: 'trigger-trace;custom-foo="bar;bar";custom-bar=foo',
    sample: true,
    expected: 'trigger-trace=ok;ignored=bar"',
    expectedKeys: oa({'custom-foo': '"bar', 'custom-bar': 'foo'}, ttKey)},
  {desc: 'handle missing keys',
    options: ';trigger-trace;custom-something=value_thing;pd-keys=02973r70:9wqj21,0d9j1;1;2;3;4;5;=custom-key=val?;=',
    sample: true,
    expected: 'trigger-trace=ok;ignored=1,2,3,4,5,',
    expectedKeys: oa({'custom-something': 'value_thing', PDKeys: '02973r70:9wqj21,0d9j1'}, ttKey)},
  {desc: 'handle multiple sequential ;;;',
    options: 'custom-something=value_thing;pd-keys=02973r70;;;;custom-key=val',
    sample: true,
    expected: 'trigger-trace=not-requested',
    expectedKeys: {'custom-something': 'value_thing', PDKeys: '02973r70', 'custom-key': 'val'}},
  {desc: 'handle a valid signature',
    options: `trigger-trace;pd-keys=${pdKeysValue};${signedCustomKey}=${signedCustomValue};ts=\${ts}`,
    ts: 'ts', sig: 'good', sample: true,
    expected: 'auth=ok;trigger-trace=ok',
    expectedKeys: oa({PDKeys: pdKeysValue}, ttKey)},
  {desc: 'respond that a signature is not valid',
    options: `trigger-trace;pd-keys=${pdKeysValue};ts=\${ts}`,
    ts: 'ts', sig: 'bad', sample: false,
    expected: 'auth=bad-signature',
    expectedKeys: {PDKeys: pdKeysValue}},
  {desc: 'respond that an expired timestamp is not valid',
    options: `trigger-trace;pd-keys=${pdKeysValue};ts=\${ts}`,
    ts: 'expired', sig: 'good', sample: false,
    expected: 'auth=bad-timestamp',
    expectedKeys: {PDKeys: pdKeysValue}},
  {desc: 'respond that a missing timestamp is not valid',
    options: `trigger-trace;pd-keys=${pdKeysValue}`,
    sig: 'good', sample: false,
    expected: 'auth=bad-timestamp',
    expectedKeys: {PDKeys: pdKeysValue}},
  {desc: 'respond that trigger trace is disabled when it is',
    options: `trigger-trace;pd-keys=${pdKeysValue};${signedCustomKey}=${signedCustomValue};ts=\${ts}`,
    ts: 'ts', sig: 'good', sample: false,
    setup: disableTT, teardown: restoreTT,
    expected: 'trigger-trace=trigger-trace-disabled',
    expectedKeys: {PDKeys: pdKeysValue}},
  {desc: 'respond that tracing is disabled when it is',
    options: `trigger-trace;pd-keys=${pdKeysValue};${signedCustomKey}=${signedCustomValue};ts=\${ts}`,
    ts: 'ts', sig: 'good', sample: false,
    setup: disableTracing, teardown: restoreTracing,
    expected: 'auth=not-checked;trigger-trace=tracing-disabled',
    expectedKeys: {PDKeys: pdKeysValue}},
];
/* eslint-enable max-len */

//
// helpers to disable/restore trigger-tracing and tracing
//
function disableTT () {
  erStack.push(ao.cfg.triggerTraceEnabled);
  ao.cfg.triggerTraceEnabled = false;
}
function restoreTT () {
  ao.cfg.triggerTraceEnabled = erStack.pop();
}

function disableTracing () {
  erStack.push(ao.traceMode);
  ao.traceMode = 'disabled';
}
function restoreTracing () {
  ao.traceMode = erStack.pop();
}

//
// helper to make headers using a test definition as the spec.
//
function makeSignedHeaders (test) {
  let options = test.options;
  if (test.ts) {
    // make unix timestamp - seconds since epoch.
    let ts = Math.floor(Date.now() / 1000);
    if (test.ts === 'expired') {
      // force it 5 minutes and 1 second ago.
      ts -= 60 * 5 + 1;
    }
    options = options.replace('${ts}', ts);
  }
  const headers = {'x-trace-options': options};

  if (test.sig) {
    const token = test.sig === 'bad' ? badMockToken : mockToken;
    const hmac = hmacSha1(options, token);
    const hexString = hashToHex(hmac);
    headers['x-trace-options-signature'] = hexString;
  }

  return headers;
}

//
// here's the runtime test environment setup.
//
describe('probes.http trigger-trace', function () {
  let emitter

  before(function (done) {
    // setup to handle messages
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'

    // set the testing context for debugging tests.
    ao.g.testing(__filename)
  })

  let options;
  let server;
  let p;
  const afterServerIsReady = new Promise(resolve => {
    p = resolve;
  });

  // create a server once
  before(function (done) {
    server = http.createServer(function (req, res) {
      res.end('done')
    });
    server.listen(function () {
      options = {url: `http://localhost:${server.address().port}`};
      p();
      done()
    });
  });

  // and close it when done
  after(function () {
    server.close();
  })
  after(function (done) {
    emitter.close(done)
  })
  after(function () {
    testdebug(`enters ${ao.Span.entrySpanEnters} exits ${ao.Span.entrySpanExits}`)
  })

  // from test/http.test.js
  const check = {
    server: {
      entry: function (msg) {
        expect(msg).property('Layer', 'nodejs')
        expect(msg).property('Label', 'entry')
      },
      exit: function (msg) {
        expect(msg).property('Layer', 'nodejs')
        expect(msg).property('Label', 'exit')
      }
    },
  }

  // would be nice if oboe had a udp-counter.
  it('should do it\'s UDP thing', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () {})
      done()
    }, [
      function (msg) {
        expect(msg).property('Label').oneOf(['entry', 'exit']);
        expect(msg).property('Layer', 'fake')
      }
    ], done)
  })

  //
  // here's where the tests really get executed
  //
  tests.forEach(test => {
    it(`should ${test.desc}`, function (done) {
      afterServerIsReady.then(() => {
        executeTest(test, done);
      });
    });
  });

  // and this does the real work to execute the tests.
  function executeTest (t, done) {
    let messageCount = 0;
    let response;
    // if the test should be sampled set up the expected messages
    // to be received. if not sampled make sure it isn't by counting
    // the messages received.
    if (t.sample) {
      // which KV pairs should be expected?
      const expectedKeys = t.expectedKeys || {};
      helper.doChecks(emitter, [
        function (msg) {
          testdebug('checking entry');
          check.server.entry(msg);

          for (const key in expectedKeys) {
            expect(msg).property(key, expectedKeys[key]);
          }
          //expect(msg).property('Method', 'GET')
          //expect(msg).property('Proto', 'http')
          //expect(msg).property('HTTP-Host', 'localhost')
          //expect(msg).property('Port', port)
          //expect(msg).property('URL', '/foo?bar=baz')
          //expect(msg).property('ClientIP')
        },
        function (msg) {
          testdebug('checking exit');
          check.server.exit(msg)
          //expect(msg).property('Status', 200)
        }
      ], function () {
        //done();  // removed in favor of using timeouts
      });
    } else {
      function counterListener (msg) {
        messageCount += 1;
      }
      emitter.removeAllListeners('message');
      emitter.on('message', counterListener);
    }

    // the test might have specific setup required. this was put into place to
    // disable tracing/trigger-tracing so those conditions could be tested.
    if (t.setup) {
      t.setup();
    }

    // make the request. using a catch on the promise chain is required when an
    // expect assertion fails it will error out otherwise, so catch the error,
    // print it for clarity, and make sure a teardown is executed if present.
    const opts = Object.assign({}, options, {headers: makeSignedHeaders(t)});
    axios.request(opts)
      .then(r => {
        response = r.headers['x-trace-options-response'];
        expect(typeof response).equal('string', 'x-trace-options-response header must be a string');
        expect(response).equal(t.expected);
        // wait to make sure no messages come in if not expected any.
        return wait(200);
      })
      .then(() => {
        if (!t.sample) {
          expect(messageCount).equal(0, 'messageCount must equal 0');
        }
        if (t.teardown) {
          t.teardown();
        }
        done();
      })
      .catch(e => {
        console.log(e.message); // eslint-disable-line
        if (t.teardown) {
          t.teardown();
        }
        done(e);
      });
  }

})

//
// helper to wait using promises
//
function wait (ms) {
  if (ms === 0) {
    return Promise.resolve()
  }
  return new Promise(resolve => setTimeout(resolve, ms))
}
