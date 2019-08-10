'use strict'

const helper = require('../helper')
const {ao} = require('../1.test-common')
const expect = require('chai').expect
const util = require('util')

const addon = ao.addon

const http = require('http');
const axios = require('axios');
const hmacSha1 = require('crypto-js/hmac-sha1');
const hashToHex = require('crypto-js/enc-hex').stringify;


// ok
const optsOK = 'trigger-trace;custom-something=value;custom-OtherThing=other val;pd-keys=029734wr70:9wqj21,0d9j1';
const respOK = 'trigger-trace=ok';

//remove leading/trailing spaces
const optsSpaces = 'custom-something=value; custom-OtherThing = other val ;pd-keys=029734wr70:9wqj21,0d9j1';
const respSpaces = 'trigger-trace=not-requested';

// report and log ignored keys
const optsIgnored = 'what_is_this=value_thing;and_that=otherval;whoot';
const respIgnored = 'trigger-trace=not-requested;ignored=what_is_this,and_that,whoot';

// ignores and logs trigger-trace with a value
const optsTTValue = 'trigger-trace=1;custom-something=value_thing';
const respTTValue = 'trigger-trace=not-requested;ignored=trigger-trace';

// keeps the value of the first repeated key
const optsDupPDKey = 'custom-something=keep_this_0;pd-keys=keep_this;pd-keys=029734wrqj21,0d9;custom-something=otherval';
const respDupPDKey = 'trigger-trace=not-requested';

// try to keep value including ‘=’
const optsWithEqual = 'trigger-trace;custom-something=value_thing=4;custom-OtherThing=other val';
const respWithEqual = 'trigger-trace=ok';

// process as best as possible, report and log bad key for bar’
const optsQuoted = 'trigger-trace;custom-foo="bar;bar";custom-bar=foo';
const respQuoted = 'trigger-trace=ok;ignored=bar"';

// process and log as best as possible: 1, 2, 3, 4, 5 are ignored,
// =custom-key=val?;==abc=and_now? are skipped (not processed) may get lost because there is no key:
const optsEmptyKeys = ';trigger-trace;custom-something=value_thing;pd-keys=02973r70:9wqj21,0d9j1;1;2;3;4;5;=custom-key=val?;=';
const respEmptyKeys = 'trigger-trace=ok;ignored=1,2,3,4,5,';

// gracefully handles sequential ;;;
const optsEmptyFields = 'custom-something=value_thing;pd-keys=02973r70;;;;custom-key=val';
const respEmptyFields = 'trigger-trace=not-requested';

const optionsTests = [
  {req: optsOK, res: respOK},
  {req: optsSpaces, res: respSpaces},
  {req: optsIgnored, res: respIgnored},
  {req: optsTTValue, res: respTTValue},
  {req: optsDupPDKey, res: respDupPDKey},
  {req: optsWithEqual, res: respWithEqual},
  {req: optsQuoted, res: respQuoted},
  {req: optsEmptyKeys, res: respEmptyKeys},
  {req: optsEmptyFields, res: respEmptyFields},
]

// Sample X-Trace-Options-Signature and X-Trace-Options to test
// This token is used for udp/file-reporter testing.
const mockToken = '8mZ98ZnZhhggcsUmdMbS';
const badMockToken = 'xyzzyadventuredragon';
const signedPdKeys = 'lo:se,check-id:123';

const signedTests = [
  // ok
  {options: 'trigger-trace;pd-keys=lo:se,check-id:123;ts=${ts}', ts: 'ts', desc: 'a correct signature'},
  // bad, signature doesn't match
  {options: 'trigger-trace;pd-keys=lo:se,check-id:123;ts=${ts}', ts: 'ts', sig: 'bad', desc: 'an incorrect signature'},
  // bad, timestamp outside window
  {options: 'trigger-trace;pd-keys=lo:se,check-id:123;ts=${ts}', ts: 'expired', desc: 'an expired timestamp'},
  // bad, missing timestamp
  {options: 'trigger-trace;pd-keys=lo:se,check-id:123', desc: 'a missing timestamp'},
];

function makeSignedHeaders (test) {
  let options = test.options;
  if (test.ts) {
    let ts = Math.floor(Date.now() / 1000);
    if (test.ts === 'expired') {
      // force it 5 minutes and 1 second ago.
      ts -= 60 * 5 + 1;
    }
    options = options.replace('${ts}', ts);
  }
  const token = test.sig === 'bad' ? badMockToken : mockToken;
  const hmac = hmacSha1(options, token);
  const hexString = hashToHex(hmac);
  return {
    'x-trace-options': options,
    'x-trace-options-signature': hexString,
  }
}

const checks = {
  entry: function (msg) {
    expect(msg).property('Layer', 'nodejs')
    expect(msg).property('Label', 'entry')
  },
  exit: function (msg) {
    expect(msg).property('Layer', 'nodejs')
    expect(msg).property('Label', 'exit')
  }
};

//
// mock up a getTraceSettings function until oboe is ready.
//
function mockGetTraceSettings (options) {
  return {
    status: 0,                              // ok
    message: "ok",
    authStatus: -2,                         // not checked
    authMessage: "not-checked",
    metadata: addon.Metadata.makeRandom(1), // sampled
    metadataFromXtrace: false,
    edge: false,
    doSample: true,
    doMetrics: true,
    source: 6,
    rate: ao.sampleRate,
  }
}



describe('probes.http', function () {
  const ctx = {http: http}
  let emitter
  let realGetTraceSettings;
  const previousHttpEnabled = ao.probes.http.enabled
  const previousHttpClientEnabled = ao.probes['http-client'].enabled
  let clear

  //
  // Simulate trigger-trace handling in addon.getTraceSettings() until
  // an oboe supporting them is released.
  //
  // When oboe supports trigger-trace then the sent messages should be checked
  // for the correct KV pairs as well.
  //
  before(function (done) {
    // setup to handle messages
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'

    // simulate getTraceSettings()
    realGetTraceSettings = ao.addon.Settings.getTraceSettings;
    //ao.addon.Settings.getTraceSettings = mockGetTraceSettings;

    // set the testing context for debugging tests.
    ao.g.testing(__filename)
  })
  after(function (done) {
    ao.addon.getTraceSettings = realGetTraceSettings;
    emitter.close(done)
  })
  after(function () {
    ao.loggers.debug(`enters ${ao.Span.entrySpanEnters} exits ${ao.Span.entrySpanExits}`)
  })


  beforeEach(function () {
    if (this.currentTest.title === 'should not report anything when http probe is disabled') {
      ao.probes.http.enabled = false
      ao.probes['http-client'].enabled = false
    } else if (this.currentTest.title === 'should trace correctly within asyncrony') {
      //this.skip()
    } else if (this.currentTest.title === 'should not send a span or metrics when there is a filter for it') {
      //this.skip()
    }
  })

  afterEach(function () {
    if (this.currentTest.title === 'should not report anything when http probe is disabled') {
      ao.probes.http.enabled = previousHttpEnabled
      ao.probes['http-client'].enabled = previousHttpClientEnabled
    } else if (this.currentTest.title === 'should not send a span when there is a filter for it') {
      ao.specialUrls = undefined
    }
  })
  afterEach(function () {
    if (clear) {
      clear()
      clear = undefined
    }
  })

  const check = {
    server: {
      entry: function (msg) {
        expect(msg).property('Layer', 'nodejs')
        expect(msg).property('Label', 'entry')
      },
      info: function (msg) {
        expect(msg).property('Label', 'info')
      },
      error: function (msg) {
        expect(msg).property('Label', 'error')
      },
      exit: function (msg) {
        expect(msg).property('Layer', 'nodejs')
        expect(msg).property('Label', 'exit')
      }
    },
    client: {
      entry: function (msg) {
        expect(msg).property('Layer', 'http-client')
        expect(msg).property('Label', 'entry')
      },
      info: function (msg) {
        expect(msg).property('Label', 'info')
      },
      error: function (msg) {
        expect(msg).property('Label', 'error')
      },
      exit: function (msg) {
        expect(msg).property('Layer', 'http-client')
        expect(msg).property('Label', 'exit')
      }
    }
  }

  describe('trigger-trace', function () {
    const requests = [];
    const results = [];
    let options;
    let server;
    let p;
    let afterServerIsReady = new Promise(resolve => {
      p = resolve;
    });

    //
    // Verify a correct x-trace-response header is returned for each test case.
    //
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

    after(function () {
      server.close();
    })

    describe('it should handle x-trace-options correctly', function () {
      optionsTests.forEach(t => {
        it(`should handle ${t.req}`, function (done) {
          afterServerIsReady.then(() => {
            const opts = Object.assign({}, options, {headers: {'x-trace-options': t.req}})
            axios.request(opts)
              .then(r => {
                //console.log(`options response=${r.headers['x-trace-options-response']}`)
                expect(r.headers['x-trace-options-response']).equal(t.res);
                done();
              });
          });
        });
      });
    });

    describe('it should handle x-trace-options with x-trace-options-signature', function () {
      signedTests.forEach(t => {
        it(`should handle ${t.desc}`, function (done) {
          afterServerIsReady.then(() => {
            signedTest(t, done);
          })
        })
      });
    });

    function signedTest (t, done) {
      helper.doChecks(emitter, [
        function (msg) {
          console.log('checking entry');
          check.server.entry(msg);
          expect(msg).property('pd-keys', signedPdKeys);
          //expect(msg).property('Method', 'GET')
          //expect(msg).property('Proto', 'http')
          //expect(msg).property('HTTP-Host', 'localhost')
          //expect(msg).property('Port', port)
          //expect(msg).property('URL', '/foo?bar=baz')
          //expect(msg).property('ClientIP')
        },
        function (msg) {
          console.log('checking exit');
          check.server.exit(msg)
          //expect(msg).property('Status', 200)
        }
      ], function () {
        done();
      })

      const opts = Object.assign({}, options, {headers: makeSignedHeaders(t)});
      axios.request(opts)
        .then(r => {
          console.log('x-trace-options-response', r.headers['x-trace-options-response']);
        })
    }
  })
})
