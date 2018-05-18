var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon
var log = ao.loggers
var conf = ao.probes.express
var legacy = ao.probes.express.legacyTxname

var should = require('should')
var semver = require('semver')

var request = require('request')
var express = require('express')
var fs = require('fs')

// global configuration that probably should be set
// outside so multiple passes can be run from the
// same file with a little wrapper.
ao.probes.express.legacyTxname = false

//
// helper function to return a function that returns expected results for:
//   tx - transaction name
//   c - controller
//   a - action
//   p - profile
//
function makeExpected (req, func) {
  // bind this when created. an error causes req.route
  // to become undefined
  var pathToUse = req.route.path

  return function (what) {
    var controller
    var action
    var result

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
    } else if (what === 'p') {
      result = controller + ' ' + action
    }

    if (ao.cfg.domainPrefix && what === 'tx') {
      var prefix = ao.getDomainPrefix(req)
      if (prefix) {
        result = prefix + '/' + result
      }
    }

    return result
  }
}

var pkg = require('express/package.json')

describe('probes.express ' + pkg.version, function () {
  var emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
  })

  var check = {
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
    'render-exit': function (msg) {
      msg.should.have.property('Layer', 'render')
      msg.should.have.property('Label', 'exit')
    }
  }

  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
        function (msg) {
          msg.should.have.property('Label').oneOf('entry', 'exit'),
            msg.should.have.property('Layer', 'fake')
        }
      ], done)
  })


  //
  // Tests
  //
  it('should forward controller/action', function (done) {
    forwardControllerAction(done)
  })

  it ('should forward controller/action with domain prefix', function (done) {
    ao.cfg.domainPrefix = true
    try {
      forwardControllerAction(done)
    } finally {
      ao.cfg.domainPrefix = false
    }
  })

  function forwardControllerAction (done) {
    // define vars needed for expected() so multiple naming conventions can
    // be tested.
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    var expected
    function hello(req, res) {
      expected = makeExpected(req, hello)
      res.send('done')
    }

    var app = express()

    app.get(reqRoutePath, hello)

    var validations = [
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
        msg.should.have.property('TransactionName', expected('tx'))
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  //
  // custom transaction names
  //
  it('should allow a custom TransactionName', function (done) {
    // supply a simple custom function
    function custom (req, res) {
      var result = 'new-name.' + req.method + req.route.path
      return result
    }

    customTransactionName(custom, done)
  })

  it('should allow a custom TransactionName with domain prefix', function (done) {
    // simple custom function
    function custom (req, res) {
      var result = 'new-name.' + req.method + req.route.path
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
    function custom (req, res) {
      throw new Error('I am a bad function')
    }
    customTransactionName(undefined, done)
  })

  it('should handle a falsey return by the custom name function', function (done) {
    function custom (req, res) {
      return ''
    }
    customTransactionName(custom, done)
  })

  function customTransactionName (custom, done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    var customReq
    var expected

    function hello(req, res) {
      customReq = req
      expected = makeExpected(req, hello)
      res.send('done')
    }

    var app = express()

    ao.setCustomTxNameFunction('express', custom)

    app.get(reqRoutePath, hello)

    var validations = [
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
        var expectedCustom
        if (custom && custom(customReq)) {
          expectedCustom = custom(customReq)
        } else {
          expectedCustom = expected('tx')
        }
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  //
  // multiple handlers
  //
  it('should profile each middleware', function (done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    var expectedRen
    var expectedRes

    function renamer(req, res, next) {
      expectedRen = makeExpected(req, renamer)
      req.name = req.params.name
      next()
    }
    function responder (req, res) {
      expectedRes = makeExpected(req, responder)
      res.send(req.name)
    }

    var app = express()

    app.get(reqRoutePath, renamer)

    app.get(reqRoutePath, responder)

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expectedRen('p'))
        msg.should.have.property('Controller', expectedRen('c'))
        msg.should.have.property('Action', expectedRen('a'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expectedRen('p'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expectedRes('p'))
        msg.should.have.property('Controller', expectedRes('c'))
        msg.should.have.property('Action', expectedRes('a'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expectedRes('p'))

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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should profile multiple middlewares', function (done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    var expectedRen
    var expectedRes

    function renamer(req, res, next) {
      expectedRen = makeExpected(req, renamer)
      req.name = req.params.name
      next()
    }

    function responder(req, res) {
      expectedRes = makeExpected(req, responder)
      res.send(req.name)
    }

    var app = express()

    app.get(reqRoutePath, renamer, responder)

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expectedRen('p'))
        msg.should.have.property('Controller', expectedRen('c'))
        msg.should.have.property('Action', expectedRen('a'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expectedRen('p'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expectedRes('p'))
        msg.should.have.property('Controller', expectedRes('c'))
        msg.should.have.property('Action', expectedRes('a'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expectedRes('p'))
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should profile middleware specified as array', function (done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    var expectedRen
    var expectedRes

    function renamer(req, res, next) {
      expectedRen = makeExpected(req, renamer)
      req.name = req.params.name
      next()
    }

    function responder(req, res) {
      expectedRes = makeExpected(req, responder)
      res.send(req.name)
    }

    var app = express()

    app.get(reqRoutePath, [renamer, responder])

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expectedRen('p'))
        msg.should.have.property('Controller', expectedRen('c'))
        msg.should.have.property('Action', expectedRen('a'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expectedRen('p'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expectedRes('p'))
        msg.should.have.property('Controller', expectedRes('c'))
        msg.should.have.property('Action', expectedRes('a'))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expectedRes('p'))
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should trace through param() calls', function (done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    var expected

    function hello(req, res) {
      expected = makeExpected(req, hello)
      res.send('Hello, ' + req.hello + '!')
    }

    var app = express()

    app.param('name', function (req, req, next, name) {
      req.hello = name
      next()
    })

    app.get(reqRoutePath, hello)

    var validations = [
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  function renderTest (done) {
    var reqRoutePath = '/hello/:name'
    var expected
    var locals

    function fn (req, res) {
      expected = makeExpected(req, fn)
      locals = {
        name: req.params.name
      }

      // NOTE: We need to do Object.create() here because
      // express 3.x and earlier pollute this object
      res.render('hello', Object.create(locals))
    }

    var app = express()

    app.set('views', __dirname)
    app.set('view engine', 'ejs')

    app.get(reqRoutePath, fn)

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
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
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  if (semver.satisfies(pkg.version, '< 3.2.0')) {
    it.skip('should trace render span', renderTest)
  } else {
    it('should trace render span', renderTest)
  }

  it('should work with supertest', function (done) {
    var reqRoutePath = '/hello/:name'
    var expected

    function hello(req, res) {
      expected = makeExpected(req, hello)
      host = req.headers.host
      res.send('done')
    }

    var request = require('supertest')
    var app = express()

    app.get(reqRoutePath, hello)

    var validations = [
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
    var app = express()

    app.set('views', __dirname)
    app.set('view engine', 'ejs')

    app.get('/hello/:name', function (req, res) {
      res.render('hello', Object.create({
        name: req.params.name
      }))
    })

    var validations = [
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should be able to report errors from error handler', function (done) {
    var reqRoutePath = '/'
    var expected

    function route(req, res, next) {
      expected = makeExpected(req, route)
      ao.instrument(function (span) {
        return span.descend('sub')
      }, setImmediate, function (err, res) {
        next(error)
      })
    }

    var error = new Error('test')
    var app = express()

    app.get(reqRoutePath, route)

    app.use(function (error, req, res, next) {
      ao.reportError(error)
      res.send('test')
    })

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expected('p'))
        msg.should.have.property('Controller', expected('c'))
        msg.should.have.property('Action', expected('a'))
      },
      function () {},
      function () {},
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p'))
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port)
    })
  })

  it('should nest properly', function (done) {
    var reqRoutePath = '/hello/:name'
    var expected

    function hello(req, res) {
      expected = makeExpected(req, hello)
      res.send('done')
    }

    var app = express()

    var app2 = express()
    app.use(app2)

    app2.get(reqRoutePath, hello)

    var validations = [
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })



  if (semver.satisfies(pkg.version, '>= 4')) {
    it('should support express.Router()', expressRouterTest)
    it('should support app.route(path)', appRouteTest)
  } else {
    it.skip('should support express.Router()', expressRouterTest)
    it.skip('should support app.route(path)', appRouteTest)
  }

  function expressRouterTest (done) {
    var method = 'GET'
    var reqRoutePath = '/:name'
    function hello(req, res) {
      expected = makeExpected(req, hello)
      res.send('done')
    }

    var app = express()

    var router = express.Router()

    router.get(reqRoutePath, hello)

    app.use('/hello', router)

    var validations = [
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  function appRouteTest (done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    function hello(req, res) {
      expected = makeExpected(req, hello)
      res.send('done')
    }

    var app = express()

    app.route(reqRoutePath)
      .get(hello)

    var validations = [
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

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

})
