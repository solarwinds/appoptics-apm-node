var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var semver = require('semver')
var rum = require('../../lib/rum')

var request = require('request')
var fs = require('fs')

var restify
var pkg = require('restify/package.json')
if (semver.satisfies(process.version.slice(1), '> 0.8')) {
  restify = require('restify')
}

describe('probes.restify', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  // Yes, this is really, actually needed.
  // Sampling may actually prevent reporting,
  // if the tests run too fast. >.<
  beforeEach(function (done) {
    helper.padTime(done)
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
    'restify-entry': function (msg) {
      msg.should.have.property('Layer', 'restify')
      msg.should.have.property('Label', 'entry')
    },
    'restify-exit': function (msg) {
      msg.should.have.property('Layer', 'restify')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Tests
  //
  function testControllerAction (done) {
    var app = restify.createServer(pkg)

    app.get('/hello/:name', function hello (req, res) {
      res.send('done')
    })

    var validations = [
    function (msg) {
      check['http-entry'](msg)
    },
    function (msg) {
      check['restify-entry'](msg)
    },
    function () {},
    function () {},
    function (msg) {
      check['restify-exit'](msg)
    },
    function (msg) {
      check['http-exit'](msg)
      msg.should.have.property('Controller', 'GET /hello/:name')
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
  }

  function testMiddleware (done) {
    var app = restify.createServer(pkg)

    app.get('/hello/:name', function renamer (req, res, next) {
      req.name = req.params.name
      next()
    }, function responder (req, res) {
      res.send(req.name)
    })

    var validations = [
    function (msg) {
      check['http-entry'](msg)
    },
    function (msg) {
      check['restify-entry'](msg)
    },
    function (msg) {
      msg.should.have.property('Language', 'nodejs')
      msg.should.have.property('Label', 'profile_entry')
      msg.should.have.property('ProfileName', 'GET /hello/:name renamer')
      msg.should.have.property('Controller', 'GET /hello/:name')
      msg.should.have.property('Action', 'renamer')
    },
    function (msg) {
      msg.should.have.property('Language', 'nodejs')
      msg.should.have.property('Label', 'profile_exit')
      msg.should.have.property('ProfileName', 'GET /hello/:name renamer')
    },
    function (msg) {
      msg.should.have.property('Language', 'nodejs')
      msg.should.have.property('Label', 'profile_entry')
      msg.should.have.property('ProfileName', 'GET /hello/:name responder')
      msg.should.have.property('Controller', 'GET /hello/:name')
      msg.should.have.property('Action', 'responder')
    },
    function (msg) {
      msg.should.have.property('Language', 'nodejs')
      msg.should.have.property('Label', 'profile_exit')
      msg.should.have.property('ProfileName', 'GET /hello/:name responder')
    },
    function (msg) {
      check['restify-exit'](msg)
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
  }

  if (semver.satisfies(process.version.slice(1), '> 0.8')) {
    it('should forward controller/action', testControllerAction)
    it('should profile each middleware', testMiddleware)
  } else {
    it.skip('should forward controller/action', testControllerAction)
    it.skip('should profile each middleware', testMiddleware)
  }
})
