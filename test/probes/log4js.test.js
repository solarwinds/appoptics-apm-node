/* global it, describe, before, beforeEach, afterEach */
'use strict'

const ao = require('../..')

const helper = require('../helper')
const expect = require('chai').expect

const log4js = require('log4js')
const { version } = require('log4js/package.json')

const { EventEmitter } = require('events')

function checkEventInfo (eventInfo, level, message, traceId) {
  const reString = 'trace_id=[a-f0-9]{32} span_id=[a-f0-9]{16} trace_flags=0(0|1)'
  const re = new RegExp(reString)
  const m = eventInfo.match(re)

  if (traceId) {
    const parts = traceId.split('-')
    expect(m[0]).equal(`trace_id=${parts[1]} span_id=${parts[2]} trace_flags=${parts[3]}`)
  } else {
    expect(m).equal(null)
  }
}

const insertModes = [false, true, 'traced', 'sampledOnly', 'always']

//= ================================
// log4js tests
//= ================================
describe(`log4js v${version}`, function () {
  // used by each test
  let logger
  let emitter
  let counter = 0
  let pfx
  let spanName
  let eventInfo

  before(function () {
    // define log4js appender.
    // see: Custom Appenders at https://log4js-node.github.io/log4js-node/appenders.html
    function emitAppender (layout, timezoneOffset) {
      return (loggingEvent) => {
        logEmitter.emit('test-log', `${layout(loggingEvent, timezoneOffset)}\n`)
      }
    }

    // define an "inline" appender module
    // see: Advanced configuration at https://log4js-node.github.io/log4js-node/appenders.html
    const myAppenderModule = {
      configure: (config, layouts) => {
        let layout = layouts.colouredLayout
        if (config.layout) {
          layout = layouts.layout(config.layout.type, config.layout)
        }
        return emitAppender(layout, config.timezoneOffset)
      }
    }

    // listen to our fake stream.
    const logEmitter = new EventEmitter()
    logEmitter.addListener('test-log', function (s) {
      eventInfo = s
    })

    // make the logger
    log4js.configure({
      appenders: { custom: { type: myAppenderModule } },
      categories: { default: { appenders: ['custom'], level: 'debug' } }
    })

    logger = log4js.getLogger()
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
