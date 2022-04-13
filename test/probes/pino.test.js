/* global it, describe, before, beforeEach, afterEach */
'use strict'

const ao = require('../..')

const helper = require('../helper')
const expect = require('chai').expect
const os = require('os')
const semver = require('semver')

const pino = require('pino')
const { version } = require('pino/package.json')

const major = semver.major(version)

const { EventEmitter } = require('events')

const template1 = {
  level: 30,
  time: 0,
  pid: process.pid,
  hostname: os.hostname()
}

// version logging was removed in 6.0.0
// see:
// https://github.com/pinojs/pino/pull/623
const template2 = semver.gte(version, '6.0.0') ? {} : { v: 1 }

/**
 * predefined - objects set in a logger that are inherited by a child. they come
 * before the message and objects specified in a specific log call.
 *
 * msg - the string specified in the call to the logger.
 *
 * obj - the object specified in the call to the logger.
 */
function makeExpected (pre, msg, post) {
  pre = makePre(pre)
  post = makePost(post)
  return Object.assign({}, pre, { msg }, post)
}

function makePre (obj) {
  return Object.assign({}, template1, obj)
}

function makePost (obj) {
  return Object.assign({}, obj, template2)
}

function checkEventInfo (eventInfo, level, message, traceId) {
  // check the time first. just make sure it's kind of close
  eventInfo = JSON.parse(eventInfo)
  expect(eventInfo.time).within(Date.now() - 150, Date.now() + 100)
  // if the time is good reset it to be exact so expect().eql will work
  const parts = traceId ? traceId.toString().split('-') : null
  const post = Object.assign(traceId ? { sw: { trace_id: parts[1], span_id: parts[2], trace_flags: parts[3] } } : {}, { time: eventInfo.time })

  const expected = makeExpected(

    { level: pino().levels.values[level], time: eventInfo.time },
    message,
    post
  )
  expect(eventInfo).deep.equal(expected)
}

const insertModes = [false, true, 'traced', 'sampledOnly', 'always']

//= ================================
// pino tests
//= ================================
describe(`pino v${version}`, function () {
  let logger
  let emitter
  let counter = 0
  let pfx
  let spanName
  const logEmitter = new EventEmitter()

  // used by each test
  let eventInfo

  before(function () {
    // listen to our fake stream.
    logEmitter.addListener('test-log', function (s) {
      eventInfo = s
    })
  })

  before(function () {
    // make the logger
    logger = pino()

    // modify the logger so that it emits logging so it can be checked. implement
    // only the functions that are called.
    const modStream = {
      write (s) {
        logEmitter.emit('test-log', s)
      },
      flush () {},
      flushSync () {}
    }

    if (major >= 5) {
      logger[pino.symbols.streamSym] = modStream
      Object.setPrototypeOf(logger[pino.symbols.streamSym], EventEmitter.prototype)
    } else if (major >= 2) {
      logger.stream = modStream
      Object.setPrototypeOf(logger.stream, EventEmitter.prototype)
    } else {
      throw new RangeError(`pino test - unsupported version: ${version}`)
    }
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
  // Intercept messages for analysis
  //
  beforeEach(function (done) {
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.cfg.insertTraceIdsIntoLogs = true
    ao.probes.fs.enabled = false

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

  insertModes.forEach(mode => {
    const maybe = mode === false ? 'not ' : ''
    eventInfo = undefined

    it(`should ${maybe}insert in sync sampled code when mode=${mode}`, function (done) {
      const level = 'info'
      const message = `synchronous traced setting = ${mode}`
      let traceId

      ao.cfg.insertTraceIdsIntoLogs = mode

      function localDone () {
        checkEventInfo(eventInfo, level, message, mode === false ? undefined : traceId)
        done()
      }

      helper.test(emitter, function (done) {
        ao.instrument(spanName, function () {
          traceId = ao.lastEvent.toString()
          // log
          logger.info(message)
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

  insertModes.forEach(mode => {
    const maybe = (mode === 'sampledOnly' || mode === false) ? 'not ' : ''

    it(`should ${maybe}insert in sync unsampled code when mode=${mode}`, function () {
      const level = 'info'
      const message = `synchronous unsampled setting = ${mode}`
      let traceId

      // these are reset in beforeEach() so set in each test.
      ao.cfg.insertTraceIdsIntoLogs = mode
      ao.traceMode = 0
      ao.sampleRate = 0

      function test () {
        traceId = ao.lastEvent.toString()
        expect(traceId[traceId.length - 1] === '0', 'traceId shoud be unsampled')
        logger.info(message)
        return 'test-done'
      }

      const traceparent = ao.addon.Event.makeRandom(0).toString()
      const result = ao.startOrContinueTrace(traceparent, '', spanName, test)

      expect(result).equal('test-done')
      checkEventInfo(eventInfo, level, message, maybe ? undefined : traceId)
    })
  })

  it('mode=\'always\' should always insert a trace ID even if not tracing', function () {
    const level = 'info'
    const message = 'always insert'

    ao.cfg.insertTraceIdsIntoLogs = 'always'

    logger.info(message)

    checkEventInfo(eventInfo, level, message, `00-${'0'.repeat(32)}-${'0'.repeat(16)}-${'0'.repeat(2)}`)
  })

  it('should insert trace IDs in asynchronous instrumented code', function (done) {
    const level = 'error'
    const message = 'asynchronous instrumentation'
    let traceId

    function localDone () {
      checkEventInfo(eventInfo, level, message, traceId)
      done()
    }

    function asyncFunction (cb) {
      traceId = ao.lastEvent.toString()
      logger.error(message)
      setTimeout(function () {
        cb()
      }, 100)
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
    const level = 'info'
    const message = 'promise instrumentation'
    let traceId
    const result = 99

    function localDone () {
      checkEventInfo(eventInfo, level, message, traceId)
      done()
    }

    function promiseFunction () {
      traceId = ao.lastEvent.toString()
      logger[level](message)
      return new Promise((resolve, reject) => {
        setTimeout(function () {
          resolve(result)
        }, 25)
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
    const level = 'info'
    ao.cfg.insertTraceIdsIntoLogs = false
    const message = 'helper and synchronous %s'
    let traceId

    function localDone () {
      const m = message.replace('%s', traceId)
      checkEventInfo(eventInfo, level, m)
      done()
    }

    helper.test(
      emitter,
      function (done) {
        ao.instrument(spanName, function () {
          traceId = ao.lastEvent.toString()
          logger[level](message, traceId)
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
