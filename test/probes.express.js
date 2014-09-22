var debug = require('debug')('probes-express')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var request = require('request')
var express = require('express')
var fs = require('fs')

// String interpolation templating
function tmpl (text, data) {
  return text.replace(/{{([^{}]*)}}/g, function (a, expression) {
    var fn = new Function('data', 'with (data) { return ' + expression + ' }')
    return fn(data)
  })
}

describe('probes.express', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE
    oboe.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  var check = {
    'http-entry': function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'entry')
      debug('entry is valid')
    },
    'http-exit': function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'exit')
      debug('exit is valid')
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
      function () {},
      function () {},
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
      debug('test server listening on port ' + port)
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
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', 'express-route')
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'renamer')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', 'express-route')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', 'express-route')
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'responder')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', 'express-route')
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'responder')
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.close(done)
    })

    var server = app.listen(function () {
      var port = server.address().port
      debug('test server listening on port ' + port)
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should trace render layer', function (done) {
    var app = express()
    var locals

    app.set('views', __dirname)
    app.set('view engine', 'tmpl')
    app.engine('tmpl', function (file, locals, fn) {
      fs.readFile(file, function (err, data) {
        fn(null, tmpl(data.toString(), locals))
      })
    })

    app.get('/hello/:name', function (req, res) {
      locals = {
        name: req.params.name
      }
      res.render('hello', locals)
    })

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', 'express-route')
      },
      function (msg) {
        msg.should.have.property('Layer', 'render')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('TemplateFile')
        msg.should.have.property('TemplateLanguage', '.tmpl')
        msg.should.have.property('Locals')
        var Locals = JSON.parse(msg.Locals)
        Object.keys(locals).forEach(function (key) {
          Locals.should.have.property(key, locals[key])
        })
      },
      function (msg) {
        msg.should.have.property('Layer', 'render')
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.have.property('Language', 'nodejs')
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', 'express-route')
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
      debug('test server listening on port ' + port)
      request('http://localhost:' + port + '/hello/world')
    })
  })

})
