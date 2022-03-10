/* global it, describe, before, beforeEach, afterEach */
'use strict'

const ao = require('../..')

const helper = require('../helper')
const expect = require('chai').expect

const log4js = require('log4js')
const { version } = require('log4js/package.json')

const { EventEmitter } = require('events')

function checkEventInfo (eventInfo, level, message, traceId) {
  // console.log(eventInfo)
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
  const logEmitter = new EventEmitter()

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
  logEmitter.addListener('test-log', function (s) {
    eventInfo = s
  })

  before(function () {
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
        expect(traceId[traceId.length - 1] === '0', 'traceId should be unsampled')
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

  // layout tests

  // see https://log4js-node.github.io/log4js-node/layouts.html for examples
  const confiugurationsToInsert = [
    // basic
    {
      appenders: { out: { type: myAppenderModule, layout: { type: 'basic' } } },
      categories: { default: { appenders: ['out'], level: 'info' } }
    },
    // colored
    {
      appenders: { out: { type: myAppenderModule, layout: { type: 'colored' } } },
      categories: { default: { appenders: ['out'], level: 'info' } }
    },
    // messagePassThrough
    {
      appenders: { out: { type: myAppenderModule, layout: { type: 'messagePassThrough' } } },
      categories: { default: { appenders: ['out'], level: 'info' } }
    },
    // dummy
    {
      appenders: { out: { type: myAppenderModule, layout: { type: 'dummy' } } },
      categories: { default: { appenders: ['out'], level: 'info' } }
    },
    // custom level
    {
      levels: { custom: { value: 13370, levelStr: 'CUSTOM', colour: 'cyan' } },
      appenders: { out: { type: myAppenderModule, layout: { type: 'basic' } } },
      categories: { default: { appenders: ['out'], level: 'debug' } }
    },
    // two appensers
    {
      appenders: {
        out: { type: myAppenderModule, layout: { type: 'basic' } },
        other: { type: myAppenderModule, layout: { type: 'basic' } }
      },
      categories: {
        default: { appenders: ['out', 'other'], level: 'debug' }
      }
    }
  ]

  confiugurationsToInsert.forEach(config => {
    eventInfo = undefined

    const layout = config.appenders.out.layout && config.appenders.out.layout.type

    it(`should insert with ${layout} layout`, function (done) {
      const message = 'layout testing'
      let level
      let traceId

      ao.cfg.insertTraceIdsIntoLogs = true

      log4js.configure(config)
      const logger = log4js.getLogger()

      function localDone () {
        checkEventInfo(eventInfo, level, message, traceId)
        done()
      }

      helper.test(emitter, function (done) {
        ao.instrument(spanName, function () {
          traceId = ao.lastEvent.toString()
          // log
          level = typeof logger.custom === 'function' ? 'custom' : 'error'
          if (config.appenders.out.layout && config.appenders.out.layout.type === 'messagePassThrough') {
            const pass = 'pass through'
            logger.error(message, pass)
          } else {
            logger[level]('Cheese is too ripe!')
          }
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

  // see https://log4js-node.github.io/log4js-node/layouts.html for examples
  const confiugurationsToNotInsert = [
    // pattern
    {
      appenders: { out: { type: myAppenderModule, layout: { type: 'pattern', pattern: '%d %d %d %m' } } },
      categories: { default: { appenders: ['out'], level: 'info' } }
    },
    // tokens
    {
      appenders: {
        out: {
          type: myAppenderModule,
          layout: {
            type: 'pattern',
            pattern: '%d %p %c %x{user} %x{age} says: %m%n',
            tokens: {
              user: function (logEvent) {
                return 'Jake'
              },
              age: 45
            }
          }
        }
      },
      categories: { default: { appenders: ['out'], level: 'info' } }
    },
    // multi appenders, one with custom pattern
    {
      appenders: {
        out: { type: myAppenderModule, layout: { type: 'pattern', pattern: '%d %d %d %m' } },
        basic: { type: myAppenderModule, layout: { type: 'basic' } },
        app: { type: myAppenderModule }
      },
      categories: {
        default: { appenders: ['out', 'app', 'basic'], level: 'debug' }
      }
    }
  ]

  confiugurationsToNotInsert.forEach(config => {
    eventInfo = undefined

    const layout = config.appenders.out.layout && config.appenders.out.layout.type

    it(`should not insert with ${layout} layout`, function (done) {
      const message = 'layout testing'
      let level

      ao.cfg.insertTraceIdsIntoLogs = true

      log4js.configure(config)
      const logger = log4js.getLogger()

      function localDone () {
        checkEventInfo(eventInfo, level, message, null)
        done()
      }

      helper.test(emitter, function (done) {
        ao.instrument(spanName, function () {
          // log
          logger.error('Cheese is too ripe!')
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

  it('should not insert with simple addContext method', function (done) {
    const message = 'addLayout testing'
    let level

    ao.cfg.insertTraceIdsIntoLogs = true

    log4js.configure({
      appenders: {
        out: {
          type: myAppenderModule,
          layout: {
            type: 'pattern',
            pattern: '%d %p %c %X{user} %m%n'
          }
        }
      },
      categories: { default: { appenders: ['out'], level: 'info' } }
    })
    const logger = log4js.getLogger()
    logger.addContext('user', 'charlie')

    function localDone () {
      checkEventInfo(eventInfo, level, message, null)
      done()
    }

    helper.test(emitter, function (done) {
      ao.instrument(spanName, function () {
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

  it('should not insert with simple addLayout method', function (done) {
    const message = 'addLayout testing'
    let level

    ao.cfg.insertTraceIdsIntoLogs = true

    log4js.addLayout('json', function (config) {
      return function (logEvent) { return JSON.stringify(logEvent) + config.separator }
    })

    log4js.configure({
      appenders: {
        out: { type: myAppenderModule, layout: { type: 'json', separator: ',' } }
      },
      categories: {
        default: { appenders: ['out'], level: 'info' }
      }
    })
    const logger = log4js.getLogger()

    function localDone () {
      checkEventInfo(eventInfo, level, message, null)
      done()
    }

    helper.test(emitter, function (done) {
      ao.instrument(spanName, function () {
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

  it('should insert with addContext method and api token', function (done) {
    const message = 'addLayout testing'
    let level
    let traceId

    ao.cfg.insertTraceIdsIntoLogs = true

    log4js.configure({
      appenders: {
        out: {
          type: myAppenderModule,
          layout: {
            type: 'pattern',
            pattern: '%d %p %c %X{user} %X{trace} %m%n'
          }
        }
      },
      categories: { default: { appenders: ['out'], level: 'info' } }
    })
    const logger = log4js.getLogger()
    logger.addContext('user', 'charlie')
    logger.addContext('trace', function () { return ao.getLogString() })

    function localDone () {
      checkEventInfo(eventInfo, level, message, traceId)
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

  it('should insert with addLayout method and api usage', function (done) {
    const message = 'addLayout testing'
    let traceId

    ao.cfg.insertTraceIdsIntoLogs = true

    log4js.addLayout('json', function (config) {
      return function (logEvent) {
        logEvent.context = { ...logEvent.context, ...ao.insertLogObject() }
        return JSON.stringify(logEvent)
      }
    })

    log4js.configure({
      appenders: {
        out: { type: myAppenderModule, layout: { type: 'json' } }
      },
      categories: {
        default: { appenders: ['out'], level: 'info' }
      }
    })
    const logger = log4js.getLogger()

    function localDone () {
      const data = JSON.parse(eventInfo)
      const parts = traceId.split('-')

      expect(data.context.sw.trace_id).equal(parts[1])
      expect(data.context.sw.span_id).equal(parts[2])
      expect(data.context.sw.trace_flags).equal(parts[3])
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

  it('should insert with pattern and api token ', function (done) {
    const message = 'token from api'
    let level
    let traceId

    ao.cfg.insertTraceIdsIntoLogs = true

    log4js.configure({
      appenders: {
        out: {
          type: myAppenderModule,
          layout: {
            type: 'pattern',
            pattern: '%d %p %c %x{user} %x{age} says: %m is: %x{trace} %n',
            tokens: {
              user: function (logEvent) {
                return 'Jake'
              },
              age: 45,
              trace: function () { return ao.getLogString() }
            }
          }
        }
      },
      categories: { default: { appenders: ['out'], level: 'info' } }
    })
    const logger = log4js.getLogger()

    function localDone () {
      checkEventInfo(eventInfo, level, message, traceId)
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

  it('should work as express middleware', function (done) {
    const message = 'express middleware testing'
    const level = 'info'
    let traceId

    ao.cfg.insertTraceIdsIntoLogs = true
    ao.probes.express.enabled = false
    const express = require('express')
    const axios = require('axios')

    const app = express()
    app.use(log4js.connectLogger(logger))

    app.set('views', __dirname)
    app.set('view engine', 'ejs')

    app.get('/hello/:name', function (req, res) {
      // the trace id used by the middle ware is the one from the last event
      // which in this case comes from the express router
      traceId = ao.lastEvent.toString()
      res.render('hello', Object.create({
        name: req.params.name
      }))
    })

    function localDone () {
      checkEventInfo(eventInfo, level, message, traceId)
      done()
    }

    function asyncFunction () {
      const server = app.listen(async function () {
        const port = server.address().port
        await axios('http://localhost:' + port + '/hello/world')
        server.close(localDone)
      })
    }

    helper.test(emitter, function (done) {
      asyncFunction()
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'http-client')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'nodejs')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'nodejs')
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.have.property('Layer', 'http-client')
        msg.should.have.property('Label', 'exit')
      }
    ], localDone)
  })
})
