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

ao.probes.express.legacyTxname = false

function expected (what, method, path, func) {
  var req = {
    method: method,
    route: {
      path: path
    }
  }

  var controller
  var action

  if (ao.probes.express.legacyTxname) {
    // old way of setting these
    // Controller = req.route.path
    // Action = func.name || '(anonymous)'
    controller = req.route.path
    action = func.name || '(anonymous)'
  } else {
    // new way
    // Controller = 'express.' + (func.name || '(anonymous)')
    // Action = req.method + req.route.path
    controller = 'express.' + (func.name || '(anonymous)')
    action = req.method + req.route.path
  }

  if (what === 'tx') {
    return controller + '.' + action
  } else if (what === 'c') {
    return controller
  } else if (what === 'a') {
    return action
  } else if (what === 'p') {
    return controller + ' ' + action
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
    // define vars needed for expected() so multiple naming conventions can
    // be tested.
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    function hello (req, res) {
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
      function () {},
      function () {},
      function (msg) {
        check['express-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('TransactionName', expected('tx', method, reqRoutePath, hello))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, hello))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, hello))
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


  it('should allow a custom TransactionName', function (done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    function hello(req, res) {
      res.send('done')
    }
    function custom (req, res) {
      return 'new-name.' + req.method + req.route.path
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
        msg.should.have.property('TransactionName', custom({method: method, route: {path: reqRoutePath}}))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, hello))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, hello))
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
      delete conf.makeMetricsName
    })

    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })


  it('should profile each middleware', function (done) {
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    function renamer(req, res, next) {
      req.name = req.params.name
      next()
    }
    function responder (req, res) {
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
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, renamer))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, renamer))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, renamer))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, renamer))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, responder))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, responder))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, responder))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, responder))

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
    function renamer(req, res, next) {
      req.name = req.params.name
      next()
    }

    function responder(req, res) {
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
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, renamer))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, renamer))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, renamer))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, renamer))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, responder))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, responder))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, responder))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, responder))
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

    function renamer(req, res, next) {
      req.name = req.params.name
      next()
    }

    function responder(req, res) {
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
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, renamer))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, renamer))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, renamer))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, renamer))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, responder))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, responder))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, responder))
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, responder))
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
    function hello(req, res) {res.send('Hello, ' + req.hello + '!')}

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
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, hello))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, hello))
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
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    var locals
    var fn = function (req, res) {
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
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, fn))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, fn))
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
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    function hello(req, res) {
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
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, hello))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, hello))
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
    var method = 'GET'
    var reqRoutePath = '/'
    function route(req, res, next) {
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
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, route))
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, route))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, route))
      },
      function () {},
      function () {},
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', expected('p', method, reqRoutePath, route))
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
    var method = 'GET'
    var reqRoutePath = '/hello/:name'
    function hello(req, res) {
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
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, hello))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, hello))
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
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, hello))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, hello))
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
        msg.should.have.property('Controller', expected('c', method, reqRoutePath, hello))
        msg.should.have.property('Action', expected('a', method, reqRoutePath, hello))
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
