var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var semver = require('semver')

var rum = require('../../lib/rum')

var request = require('request')
var express = require('express')
var fs = require('fs')

var pkg = require('express/package.json')

describe('probes.express', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    tv.fs.enabled = false
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    tv.fs.enabled = true
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

  //
  // Tests
  //
  it('should forward controller/action', function (done) {
    var app = express()

    app.get('/hello/:name', function hello (req, res) {
      res.send('done')
    })

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
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'hello')
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

  it('should profile each middleware', function (done) {
    var app = express()

    app.get('/hello/:name', function renamer (req, res, next) {
      req.name = req.params.name
      next()
    })

    app.get('/hello/:name', function responder (req, res) {
      res.send(req.name)
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
        msg.should.have.property('ProfileName', '/hello/:name renamer')
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'renamer')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', '/hello/:name renamer')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', '/hello/:name responder')
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'responder')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', '/hello/:name responder')
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
    function renamer(req, res, next) {
      req.name = req.params.name
      next()
    }

    function responder(req, res) {
      res.send(req.name)
    }


    var app = express()

    app.get('/hello/:name', [renamer,responder])

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
        msg.should.have.property('ProfileName', '/hello/:name renamer')
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'renamer')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', '/hello/:name renamer')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', '/hello/:name responder')
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'responder')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', '/hello/:name responder')
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

  function renderTest (done) {
    var app = express()
    var locals

    app.set('views', __dirname)
    app.set('view engine', 'ejs')

    app.get('/hello/:name', function (req, res) {
      locals = {
        name: req.params.name
      }

      // NOTE: We need to do Object.create() here because
      // express 3.x and earlier pollute this object
      res.render('hello', Object.create(locals))
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
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', '(anonymous)')
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

  function rumTest (done) {
    tv.rumId = 'foo'
    var app = express()
    var locals
    var exit

    // Define simply template engine
    app.set('views', __dirname)
    app.set('view engine', 'ejs')

    // Define route to render template that should inject rum scripts
    app.get('/', function (req, res) {
      // Store exit event for use in response tests
      exit = res._http_layer.events.exit
      res.render('rum')
    })

    // Define tracelyzer message validations
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
        msg.should.have.property('Controller', '/')
        msg.should.have.property('Action', '(anonymous)')
      }
    ]

    // Delay completion until both test paths end
    var complete = helper.after(2, function () {
      server.close(done)
      delete tv.rumId
    })

    // Run tracelyzer checks
    helper.doChecks(emitter, validations, complete)

    // Start server and make a request
    var server = app.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port, function (a, b, body) {
        // Verify that the rum scripts are included in the body
        body.should.containEql(rum.header(tv.rumId, exit.toString()))
        body.should.containEql(rum.footer(tv.rumId, exit.toString()))
        complete()
      })
    })
  }

  if (semver.satisfies(pkg.version, '< 3.2.0')) {
    it.skip('should trace render layer', renderTest)
    it.skip('should include RUM scripts', rumTest)
  } else {
    it('should trace render layer', renderTest)
    it('should include RUM scripts', rumTest)
  }

  it('should work with supertest', function (done) {
    var request = require('supertest')
    var app = express()

    app.get('/hello/:name', function hello (req, res) {
      res.send('done')
    })

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
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'hello')
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

  it('should be able to report errors from error handler', function (done) {
    var error = new Error('test')
    var app = express()

    app.get('/', function route (req, res, next) {
      tv.instrument(function (layer) {
        return layer.descend('sub')
      }, setImmediate, function (err, res) {
        next(error)
      })
    })

    app.use(function (error, req, res, next) {
      tv.reportError(error)
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
        msg.should.have.property('ProfileName', '/ route')
        msg.should.have.property('Controller', '/')
        msg.should.have.property('Action', 'route')
      },
      function () {},
      function () {},
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', '/ route')
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

})
