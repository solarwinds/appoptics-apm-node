/* global it, describe, before, beforeEach, afterEach */

// note: expect() triggers a lint no-unused-expressions. no apparent reason
/* eslint-disable no-unused-expressions */

'use strict'

const ao = require('../..')

const helper = require('../helper')
const expect = require('chai').expect
const semver = require('semver')

const morgan = require('morgan')

const { version } = require('morgan/package.json')
const major = semver.major(version)

const { EventEmitter } = require('events')

let debugging = false

function checkEventInfo (eventInfo, req, res, traceId) {
  const method = req.method
  const url = req.url
  const status = res.statusCode

  if (debugging) {
    console.log('checkEventInfo()', eventInfo)
  }

  const reString = `${method} ${url} ${status} 42 - \\d+\\.\\d{3} ms( (trace_id=[a-f0-9]{32} span_id=[a-f0-9]{16} trace_flags=0(0|1)))?`
  const re = new RegExp(reString)
  const m = eventInfo.match(re)

  // output some debugging help if these don't match
  if (!m) {
    console.log('eventInfo', eventInfo, 'match', m)
  }

  expect(m).ok
  expect(m.length).equal(4)

  if (traceId) {
    const parts = traceId.split('-')
    expect(m[2]).equal(`trace_id=${parts[1]} span_id=${parts[2]} trace_flags=${parts[3]}`)
    expect(m[3]).ok
  } else {
    expect(m[2]).not.ok
    expect(m[3]).not.ok
  }
}

//
// create a fake stream that emits the object to be logged so it can be checked.
//
class TestStream extends EventEmitter {
  constructor (options) {
    super()
    const { debugging } = Object.assign({ debugging: false }, options)
    this.writable = true
    this.debugging = debugging
  }

  write (object, enc, cb) {
    this.emit('test-log', object)
    if (this.debugging) {
      console.log(object)
    }
    if (cb) {
      setImmediate(cb)
    }
  }
}

const insertModes = [false, true, 'traced', 'sampledOnly', 'always']

//= ================================
// morgan tests
//= ================================
describe(`probes.morgan ${version}`, function () {
  let logger
  let emitter
  let counter = 0
  let pfx
  let spanName
  let stream
  let logEmitter

  //
  // fake req and res so the morgan logger can be called without fiddling without
  // actually doing http requests.
  //
  const fakeReq = {
    originalUrl: '/fake/url',
    url: '/fake/url',
    method: 'GET',
    headers: {
      referer: 'someone',
      referrer: 'someone',
      'user-agent': 'james-bond'
    },
    httpVersionMajor: 2,
    httpVersionMinor: 0,
    ip: '1.2.3.4',
    _remoteAddress: '10.1.1.1',
    connection: {
      remoteAddress: '10.1.1.1'
    }
  }

  const fakeRes = {
    statusCode: 200,
    getHeader (field) {
      if (field === 'content-length') {
        return 42
      }
      return `${field}: "fake-${field}"`
    },
    writeHead (statusCode) {
      this.statusCode = statusCode
    },
    headersSent: true,
    _header: true,
    finished: true
  }

  function makeLogger (format = 'tiny') {
    return morgan(format, { stream })
  }

  // used by each test
  let eventInfo

  before(function () {
    ao.probes.fs.enabled = false
  })

  before(function () {
    //
    // only test morgan versions >= 1
    //
    if (major >= 1) {
      stream = logEmitter = new TestStream({ debugging })
    } else {
      throw new RangeError(`morgan test - unsupported version: ${version}`)
    }

    // listen to our fake stream.
    logEmitter.addListener('test-log', function (s) {
      eventInfo = s
    })
  })

  beforeEach(function () {
    // provide unique spans for up to 100 tests
    pfx = ('0' + counter++).slice(-2)
    spanName = `${pfx}-test`

    // the following are global to all tests so they can use a common
    // check function.
    eventInfo = undefined
  })

  //
  // Intercept appoptics messages for analysis
  //
  beforeEach(function (done) {
    // make sure we get sampled traces
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    // default to the simple 'true'
    ao.cfg.insertTraceIdsIntoLogs = true

    debugging = false

    emitter = helper.appoptics(done)
  })

  afterEach(function (done) {
    emitter.close(done)
  })

  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () {})
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  //
  // for each mode verify that insert works in sampled code
  //
  insertModes.forEach(mode => {
    const maybe = mode === false ? 'not ' : ''
    eventInfo = undefined

    it(`should ${maybe}insert in sync sampled code when mode=${mode}`, function (done) {
      let traceId

      // this gets reset in beforeEach() so set it in the test.
      ao.cfg.insertTraceIdsIntoLogs = mode
      logger = makeLogger()

      function localDone () {
        checkEventInfo(eventInfo, fakeReq, fakeRes, mode === false ? undefined : traceId)
        done()
      }

      helper.test(emitter, function (done) {
        ao.instrument(spanName, function () {
          traceId = ao.requestStore.get('topSpan').events.exit.event.toString()
          // log
          logger(fakeReq, fakeRes, function (err) {
            expect(err).not.ok
          })
          fakeRes.writeHead(200)
          fakeRes.finished = true
        })
        done()
      }, [
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'exit')
        }
      ], localDone)
    })
  })

  //
  // for each mode verify that insert works in unsampled code
  //
  insertModes.forEach(mode => {
    const maybe = (mode === false || mode === 'sampledOnly') ? 'not ' : ''

    it(`should ${maybe}insert in sync unsampled code when mode=${mode}`, function (done) {
      let traceId

      // reset in beforeEach() so set in each test.
      ao.cfg.insertTraceIdsIntoLogs = mode
      logger = makeLogger()
      ao.traceMode = 0
      ao.sampleRate = 0

      function test () {
        // log
        logger(fakeReq, fakeRes, function (err) {
          expect(err).not.ok
          // let the listener run
          setImmediate(function () {
            traceId = ao.lastEvent.toString()
            expect(traceId[traceId.length - 1] === '0', 'traceId should be unsampled')
            checkEventInfo(eventInfo, fakeReq, fakeRes, maybe ? undefined : traceId)
            done()
          })
        })

        fakeRes.writeHead(200)
        fakeRes.finished = true

        return 'test-done'
      }

      const traceparent = ao.addon.Event.makeRandom(0).toString()
      const result = ao.startOrContinueTrace(traceparent, '', spanName, test)
      expect(result).equal('test-done')
    })
  })

  //
  // for each mode verify that insert works in sampled code
  //
  insertModes.forEach(mode => {
    const maybe = mode === false ? 'not ' : ''
    eventInfo = undefined

    it(`should ${maybe}insert in when mode=${mode} using a format function`, function (done) {
      let traceId

      // this gets reset in beforeEach() so set it in the test.
      ao.cfg.insertTraceIdsIntoLogs = mode
      logger = makeLogger(function () { return 'xyzzy' })

      function localDone () {
        const parts = traceId.split('-')
        const expected = mode === false ? '' : ` trace_id=${parts[1]} span_id=${parts[2]} trace_flags=${parts[3]}`
        expect(eventInfo).equal(`xyzzy${expected}\n`)
        done()
      }

      helper.test(emitter, function (done) {
        ao.instrument(spanName, function () {
          traceId = ao.requestStore.get('topSpan').events.exit.event.toString()
          // log
          logger(fakeReq, fakeRes, function (err) {
            expect(err).not.ok
          })
          fakeRes.writeHead(200)
          fakeRes.finished = true
        })
        done()
      }, [
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'exit')
        }
      ], localDone)
    })
  })

  //
  // verify that mode 'always' inserts even when not tracing
  //
  it('mode=\'always\' should always insert a trace ID even if not tracing', function (done) {
    ao.requestStore.run(function () {
      const traceId = `00-${'0'.repeat(32)}-${'0'.repeat(16)}-${'0'.repeat(2)}`
      ao.lastEvent = undefined

      ao.cfg.insertTraceIdsIntoLogs = 'always'
      logger = makeLogger()
      ao.traceMode = 0
      ao.sampleRate = 0
      // console.log(ao.lastEvent);

      logger(fakeReq, fakeRes, function (err) {
        expect(err).not.ok
        // let the listener run
        setImmediate(function () {
          checkEventInfo(eventInfo, fakeReq, fakeRes, traceId)
          done()
        })
        fakeRes.writeHead(200)
        fakeRes.finished = true
      })
    }, { newContext: true })
  })

  it('should insert trace IDs in asynchronous instrumented code', function (done) {
    let traceId

    logger = makeLogger()

    function localDone () {
      checkEventInfo(eventInfo, fakeReq, fakeRes, traceId)
      done()
    }

    function asyncFunction (cb) {
      logger(fakeReq, fakeRes, function (err) {
        expect(err).not.ok
      })
      setImmediate(function () {
        traceId = ao.lastEvent.toString()
        cb()
      })
      fakeRes.writeHead(200)
      fakeRes.finished = true
    }

    helper.test(emitter, function (done) {
      ao.instrument(spanName, asyncFunction, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', spanName)
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', spanName)
        msg.should.have.property('Label', 'exit')
      }
    ], localDone)
  })

  it('should insert trace IDs in promise-based instrumented code', function (done) {
    let traceId
    const result = 99
    logger = makeLogger()

    function localDone () {
      checkEventInfo(eventInfo, fakeReq, fakeRes, traceId)
      done()
    }

    function promiseFunction () {
      traceId = ao.lastEvent.toString()
      return new Promise((resolve, reject) => {
        logger(fakeReq, fakeRes, function (err) {
          expect(err).not.ok
          setImmediate(() => resolve(result))
        })
        fakeRes.writeHead(200)
        fakeRes.finished = true
      })
    }

    helper.test(
      emitter,
      function (done) {
        ao.pInstrument(spanName, promiseFunction).then(r => {
          expect(r).equal(result)
          done()
        })
      }, [
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'exit')
        }
      ], localDone)
  })

  it('should insert trace IDs using the function directly', function (done) {
    ao.cfg.insertTraceIdsIntoLogs = false
    let traceId

    logger = makeLogger('traceThis::my-trace-id')

    const myTraceId = () => {
      const parts = ao.lastEvent ? ao.lastEvent.toString().split('-') : ['00', '0'.repeat(32), '0'.repeat(16), '0'.repeat(2)]
      return `trace_id=${parts[1]} span_id=${parts[2]} trace_flags=${parts[3]}`
    }
    morgan.token('my-trace-id', myTraceId)

    function localDone () {
      const parts = traceId.split('-')
      const expected = `trace_id=${parts[1]} span_id=${parts[2]} trace_flags=${parts[3]}`
      expect(eventInfo).equal(`traceThis:${expected}\n`)
      done()
    }

    helper.test(
      emitter,
      function (done) {
        ao.instrument(spanName, function () {
          traceId = ao.requestStore.get('topSpan').events.exit.event.toString()
          logger(fakeReq, fakeRes, function (err) {
            expect(err).not.ok
          })
        })
        done()
      },
      [
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', spanName)
          msg.should.have.property('Label', 'exit')
        }
      ],
      localDone
    )
  })
})
