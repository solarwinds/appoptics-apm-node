/* global it, describe, before, beforeEach, after, afterEach */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common')

const legacy = ao.probes.express.legacyTxname

const semver = require('semver')

const request = require('request')
const express = require('express')
const morgan = require('morgan')
const bodyParser = require('body-parser')
const methodOverride = require('method-override')

// global configuration that probably should be set
// outside so multiple passes can be run from the
// same file with a little wrapper.
ao.probes.express.legacyTxname = false && legacy

//
// helper function to return a function that returns expected results for:
//   tx - transaction name
//   c - controller
//   a - action
//   l - layer name (express-route:function-name)
//
function makeExpected (req, func) {
  // bind this when created. an error causes req.route
  // to become undefined
  const pathToUse = req.route.path

  return function (what) {
    let controller
    let action
    let result

    if (ao.probes.express.legacyTxname) {
      // old way of setting these
      // Controller = req.route.path
      // Action = func.name || '(anonymous)'
      controller = pathToUse
      action = func.name || '(anonymous)'
    } else {
      // new way
      // Controller = 'express.' + (func.name || '(anonymous)')
      // Action = req.method + req.route.path
      controller = 'express.' + (func.name || '(anonymous)')
      action = req.method + pathToUse
    }

    if (what === 'tx') {
      result = controller + '.' + action
    } else if (what === 'c') {
      result = controller
    } else if (what === 'a') {
      result = action
    } else if (what === 'l') {
      result = `express-route:${func.name || 'anonymous'}`
    }

    if (ao.cfg.domainPrefix && what === 'tx') {
      const prefix = ao.getDomainPrefix(req)
      if (prefix) {
        result = prefix + '/' + result
      }
    }

    return result
  }
}

//
// Tests
//
const pkg = require('express/package.json')

describe('probes.express ' + pkg.version, function () {
  let emitter
  let clear

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    ao.probes.express.collectBacktraces = false
    ao.probes.fs.enabled = false
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    emitter = helper.appoptics(done)
    ao.g.testing(__filename)
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
  })

  beforeEach(function () {
    if (this.currentTest) {
      const title = this.currentTest.title

      if (title.indexOf('should allow a custom TransactionName') === 0) {
        // ao.logLevelAdd('test:messages')
      } else {
        ao.logLevelRemove('test:messages')
      }

      if (title === 'UDP might lose a message') {
        // this.skip()
      } else if (title.indexOf('should forward controller/action for') !== 0) {
        // this.skip()
      }
    }
  })
  afterEach(function () {
    if (clear) {
      clear()
      clear = undefined
    }
  })

  //
  // the messages that might be expected for a test.
  //
  const check = {
    'http-entry': function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'entry')
    },
    'http-exit': function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'exit')
    },
    'express-entry': function (msg) {
      msg.should.have.property('Layer', 'express')
      msg.should.have.property('Label', 'entry')
    },
    'express-exit': function (msg) {
      msg.should.have.property('Layer', 'express')
      msg.should.have.property('Label', 'exit')
    },
    'render-entry': function (msg) {
      msg.should.have.property('Layer', 'render')
      msg.should.have.property('Label', 'entry')
    },
    'render-exit': function (msg) {
      msg.should.have.property('Layer', 'render')
      msg.should.have.property('Label', 'exit')
    },
    'route:globalRoute-entry': function (msg) {
      msg.should.have.property('Layer', 'express-route:globalRoute')
      msg.should.have.property('Label', 'entry')
    },
    'route:globalRoute-exit': function (msg) {
      msg.should.have.property('Layer', 'express-route:globalRoute')
      msg.should.have.property('Label', 'exit')
    },
    'route:hello-entry': function (msg) {
      msg.should.have.property('Layer', 'express-route:hello')
      msg.should.have.property('Label', 'entry')
    },
    'route:hello-exit': function (msg) {
      msg.should.have.property('Layer', 'express-route:hello')
      msg.should.have.property('Label', 'exit')
    },
    'route:set-name-entry': function (msg) {
      msg.should.have.property('Layer', 'express-route:setName')
      msg.should.have.property('Label', 'entry')
    },
    'route:set-name-exit': function (msg) {
      msg.should.have.property('Layer', 'express-route:setName')
      msg.should.have.property('Label', 'exit')
    },
    'body-parser-entry': function (msg) {
      msg.should.have.property('Layer', 'body-parser')
      msg.should.have.property('Label', 'entry')
    },
    'body-parser-exit': function (msg) {
      msg.should.have.property('Layer', 'body-parser')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // the sequences of messages expected for a given method
  //
  function getValidations (method, httpExitChecks) {
    function httpExit (msg) {
      check['http-exit'](msg)
      httpExitChecks(msg)
    }
    const allValidations = {
      get: [
        'http-entry', 'express-entry',
        'route:globalRoute-entry', 'route:globalRoute-exit',
        'route:hello-entry',
        'route:hello-exit',
        'express-exit', httpExit
      ],
      post: [
        'http-entry', 'express-entry',
        'body-parser-entry', 'body-parser-exit',
        'route:set-name-entry',
        'route:set-name-exit',
        'express-exit', httpExit
      ]
    }
    const validations = allValidations[method].map(v => typeof v === 'string' ? check[v] : v)

    return validations
  }

  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  //
  // Tests
  //
  it('should forward controller/action for GET', function (done) {
    forwardControllerAction('get', done)
  })

  it('should forward controller/action for POST', function (done) {
    forwardControllerAction('post', done)
  })

  it('should forward controller/action with domain prefix', function (done) {
    ao.cfg.domainPrefix = true
    try {
      forwardControllerAction('get', done)
    } finally {
      ao.cfg.domainPrefix = false
    }
  })

  function forwardControllerAction (method, done) {
    // define vars needed for expected() so multiple naming conventions can
    // be tested.
    const getRoutePath = '/hello/:name'
    const postRoutePath = '/api/set-name'

    let expected
    function hello (req, res) {
      helper.clsCheck()
      expected = makeExpected(req, hello)
      res.send('done')
    }
    function setName (req, res) {
      helper.clsCheck()
      // const name = req.body.name
      expected = makeExpected(req, setName)
      res.send('done')
    }

    const app = express()
    // log every request to the console
    app.use(morgan('dev', {
      skip: function (req, res) { return true }
    }))
    // parse application/x-www-form-urlencoded
    app.use(bodyParser.urlencoded({ extended: 'true' }))
    // parse application/json
    app.use(bodyParser.json())
    // simulate DELETE and PUT
    app.use(methodOverride())

    app.get('*', function globalRoute (req, res, next) {
      helper.clsCheck()
      next()
    })
    app.get(getRoutePath, hello)
    app.post(postRoutePath, setName)

    function httpExitChecks (msg) {
      msg.should.have.property('TransactionName', expected('tx'))
      msg.should.have.property('Controller', expected('c'))
      msg.should.have.property('Action', expected('a'))
    }

    const validations = getValidations(method, httpExitChecks)

    // let validations = [
    //  function (msg) {
    //    check['http-entry'](msg)
    //  },
    //  function (msg) {
    //    check['express-entry'](msg)
    //  },
    // ]
    // if (method === 'get') {
    //  validations = validations.concat([
    //    function (msg) {
    //      check['route:globalRoute-entry'](msg)
    //    },
    //    function (msg) {
    //      check['route:globalRoute-exit'](msg)
    //    },
    //    function (msg) {
    //      check['route:hello-entry'](msg)
    //    },
    //    function (msg) {
    //      check['express-exit'](msg)
    //    },
    //    function (msg) {
    //      check['http-exit'](msg)
    //      msg.should.have.property('TransactionName', expected('tx'))
    //      msg.should.have.property('Controller', expected('c'))
    //      msg.should.have.property('Action', expected('a'))
    //    },
    //    function (msg) {
    //      check['route:hello-exit'](msg)
    //    },
    //  ])
    // }

    // validations = validations.concat([
    // ])

    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      const options = {
        url: 'http://localhost:' + port + (method === 'get' ? '/hello/world' : '/api/set-name')
      }
      if (method === 'post') {
        options.json = { name: 'bruce' }
      }
      request[method](options)
    })
  }

  //
  // custom transaction names
  //
  it('should allow a custom TransactionName', function (done) {
    // supply a simple custom function
    function custom (req, res) {
      const result = 'new-name.' + req.method + req.route.path
      return result
    }

    customTransactionName(custom, done)
  })

  it('should allow a custom TransactionName with domain prefix', function (done) {
    // simple custom function
    function custom (req, res) {
      const result = 'new-name.' + req.method + req.route.path
      return result
    }

    ao.cfg.domainPrefix = true
    try {
      customTransactionName(custom, done)
    } finally {
      ao.cfg.domainPrefix = false
    }
  })

  it('should handle an error in the custom name function', function (done) {
    const error = new Error('I am a bad function')
    function custom (req, res) {
      throw error
    }
    const logChecks = [
      { level: 'error', message: 'express customNameFunc() error:', values: [error] }
    ];
    [, clear] = helper.checkLogMessages(logChecks)
    customTransactionName(custom, done)
  })

  it('should handle a falsey return by the custom name function', function (done) {
    function custom (req, res) {
      return ''
    }
    customTransactionName(custom, done)
  })

  function customTransactionName (custom, done) {
    const reqRoutePath = '/hello/:name'
    let customReq
    let expected

    function hello (req, res) {
      helper.clsCheck()
      customReq = req
      expected = makeExpected(req, hello)
      res.send('done')
    }

    const app = express()

    ao.setCustomTxNameFunction('express', custom)

    app.get(reqRoutePath, hello)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function () { },
      function () { },
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        let expectedCustom = expected('tx')
        if (custom) {
          try {
            const expectedCustomName = custom(customReq)
            if (expectedCustomName) {
              expectedCustom = expectedCustomName
            }
          } catch (e) {
            // do nothing
          }
        }
        /*
        if (custom && custom(customReq)) {
          expectedCustom = custom(customReq)
        } else {
          expectedCustom = expected('tx')
        }
        // */
        if (ao.cfg.domainPrefix) {
          expectedCustom = customReq.headers.host + '/' + expectedCustom
        }
        msg.should.have.property('TransactionName', expectedCustom)
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  //
  // multiple handlers
  //
  it('should have a span for each middleware', function (done) {
    const reqRoutePath = '/hello/:name'
    let expectedRen
    let expectedRes

    function renamer (req, res, next) {
      helper.clsCheck()
      expectedRen = makeExpected(req, renamer)
      req.name = req.params.name
      next()
    }
    function responder (req, res) {
      helper.clsCheck()
      expectedRes = makeExpected(req, responder)
      res.send(req.name)
    }

    const app = express()

    app.get(reqRoutePath, renamer)

    app.get(reqRoutePath, responder)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRen('l'))
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Controller', expectedRen('c'))
        msg.should.have.property('Action', expectedRen('a'))
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRen('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRes('l'))
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Controller', expectedRes('c'))
        msg.should.have.property('Action', expectedRes('a'))
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRes('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should create spans for multiple middlewares', function (done) {
    const reqRoutePath = '/hello/:name'
    let expectedRen
    let expectedRes

    function renamer (req, res, next) {
      helper.clsCheck()
      expectedRen = makeExpected(req, renamer)
      req.name = req.params.name
      next()
    }

    function responder (req, res) {
      helper.clsCheck()
      expectedRes = makeExpected(req, responder)
      res.send(req.name)
    }

    const app = express()

    app.get(reqRoutePath, renamer, responder)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRen('l'))
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Controller', expectedRen('c'))
        msg.should.have.property('Action', expectedRen('a'))
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRen('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRes('l'))
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Controller', expectedRes('c'))
        msg.should.have.property('Action', expectedRes('a'))
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRes('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should create spans for middleware specified as array', function (done) {
    const reqRoutePath = '/hello/:name'
    let expectedRen
    let expectedRes

    function renamer (req, res, next) {
      helper.clsCheck()
      expectedRen = makeExpected(req, renamer)
      req.name = req.params.name
      next()
    }

    function responder (req, res) {
      helper.clsCheck()
      expectedRes = makeExpected(req, responder)
      res.send(req.name)
    }

    const app = express()

    app.get(reqRoutePath, [renamer, responder])

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRen('l'))
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Controller', expectedRen('c'))
        msg.should.have.property('Action', expectedRen('a'))
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRen('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRes('l'))
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Controller', expectedRes('c'))
        msg.should.have.property('Action', expectedRes('a'))
      },
      function (msg) {
        msg.should.have.property('Layer', expectedRes('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should trace through param() calls', function (done) {
    const reqRoutePath = '/hello/:name'
    let expected

    function hello (req, res) {
      helper.clsCheck()
      expected = makeExpected(req, hello)
      res.send('Hello, ' + req.hello + '!')
    }

    const app = express()

    app.param('name', function (req, req2, next, name) {
      req.hello = name
      next()
    })

    app.get(reqRoutePath, hello)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function () {},
      function () {},
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  function renderTest (done) {
    const reqRoutePath = '/hello/:name'
    let expected
    let locals

    function fn (req, res) {
      expected = makeExpected(req, fn)
      locals = {
        name: req.params.name
      }

      // NOTE: We need to do Object.create() here because
      // express 3.x and earlier pollute this object
      res.render('hello', Object.create(locals))
    }

    const app = express()

    app.set('views', __dirname)
    app.set('view engine', 'ejs')

    app.get(reqRoutePath, fn)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Layer', expected('l'))
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'express-render')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('TemplateFile')
        msg.should.have.property('TemplateLanguage', '.ejs')
        // msg.should.have.property('Locals')
        // var Locals = JSON.parse(msg.Locals)
        // Object.keys(locals).forEach(function (key) {
        //   Locals.should.have.property(key, locals[key])
        // })
      },
      function (msg) {
        msg.should.have.property('Layer', 'express-render')
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.have.property('Layer', expected('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  if (semver.satisfies(pkg.version, '< 3.2.0')) {
    it.skip('should trace render span', renderTest)
  } else {
    it('should trace render span', renderTest)
  }

  it('should work with supertest', function (done) {
    const reqRoutePath = '/hello/:name'
    let expected

    function hello (req, res) {
      expected = makeExpected(req, hello)
      // host = req.headers.host
      res.send('done')
    }

    const request = require('supertest')
    const app = express()

    app.get(reqRoutePath, hello)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function () {},
      function () {},
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, done)

    request(app)
      .get('/hello/world')
      .expect(200)
      .end(function (err, res) {
        // do nothing
      })
  })

  it('should skip when disabled', function (done) {
    ao.probes.express.enabled = false
    const app = express()

    app.set('views', __dirname)
    app.set('view engine', 'ejs')

    app.get('/hello/:name', function (req, res) {
      res.render('hello', Object.create({
        name: req.params.name
      }))
    })

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      ao.probes.express.enabled = true
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should be able to report errors from error handler', function (done) {
    const reqRoutePath = '/'
    let expected

    function route (req, res, next) {
      expected = makeExpected(req, route)
      ao.instrument(function (span) {
        return span.descend('sub')
      }, setImmediate, function (err, res) {
        next(error)
      })
    }

    const error = new Error('test')
    const app = express()

    app.get(reqRoutePath, route)

    app.use(function (error, req, res, next) {
      ao.reportError(error)
      res.send('test')
    })

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Layer', expected('l'))
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      },
      function () {},
      function () {},
      function (msg) {
        msg.should.have.property('Layer', expected('l'))
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'error')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg', error.message)
        msg.should.have.property('Backtrace', error.stack)
      },
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port)
    })
  })

  it('should nest properly', function (done) {
    const reqRoutePath = '/hello/:name'
    let expected

    function hello (req, res) {
      expected = makeExpected(req, hello)
      res.send('done')
    }

    const app = express()

    const app2 = express()
    app.use(app2)

    app2.get(reqRoutePath, hello)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function () {},
      function () {},
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  if (semver.satisfies(pkg.version, '>= 4')) {
    it('should support express.Router()', expressRouterTest)
    // if the following test fails intermittently or unpredictably
    // you may need to set the BUCKET settings shown in the env.sh "debug"
    // section.
    it('should support app.route(path)', appRouteTest)
  } else {
    it.skip('should support express.Router()', expressRouterTest)
    it.skip('should support app.route(path)', appRouteTest)
  }

  function expressRouterTest (done) {
    const reqRoutePath = '/:name'
    let expected

    function hello (req, res) {
      expected = makeExpected(req, hello)
      res.send('done')
    }

    const app = express()

    const router = express.Router()

    router.get(reqRoutePath, hello)

    app.use('/hello', router)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function () {},
      function () {},
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  function appRouteTest (done) {
    const reqRoutePath = '/hello/:name'
    let expected

    function hello (req, res) {
      helper.clsCheck()
      expected = makeExpected(req, hello)
      res.send('done')
    }

    const app = express()

    app.route(reqRoutePath)
      .get(hello)

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function () {},
      function () {},
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    const server = app.listen(function () {
      const port = server.address().port
      request.get('http://localhost:' + port + '/hello/world', function (err, res, body) {
        if (err) {
          throw new Error('request failed')
        } else {
          // log.debug('response: %s', body)
        }
      })
    })
  }
})
