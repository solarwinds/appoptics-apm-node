var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon

var should = require('should')
var semver = require('semver')

var request = require('request')

var pkg = require('restify/package.json')
var opts = {
  name: 'restify-test'
}

if (!semver.satisfies(process.version, '>=4')) {
  describe('probes.restify', function () {
    it.skip('not supported for node version < 4', function () {})
  })
  return
}

var restify = require('restify')

describe('probes.restify ' + pkg.version , function () {
  var emitter
  var fsState
  var logLevel

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    // restify newer versions of restify use negotiator which does file io
    fsState = ao.probes.fs.enabled
    ao.probes.fs.enabled = false
    logLevel = ao.logLevel
    ao.logLevel += ',debug'
  })
  after(function (done) {
    emitter.close(done)
    ao.probes.fs.enabled = fsState
    ao.logLevel = logLevel
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
  function testControllerAction (done) {
    var app = restify.createServer(opts)

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
    function (msg) {
      msg.should.have.property('Label', 'profile_entry')
    },
    function (msg) {
      msg.should.have.property('Label', 'profile_exit')
    },
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
    var app = restify.createServer(opts)

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
