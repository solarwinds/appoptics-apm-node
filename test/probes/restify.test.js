'use strict'

const helper = require('../helper')
const ao = helper.ao

const should = require('should')  // eslint-disable-line no-unused-vars
const semver = require('semver')

const request = require('request')

const pkg = require('restify/package.json')
const opts = {
  name: 'restify-test'
}

if (!semver.satisfies(process.version, '>=4')) {
  describe('probes.restify', function () {
    it.skip('not supported for node version < 4', function () {})
  })
  describe = function () {}
}

const restify = require('restify')

// restify does fs IO starting in node 8
if (semver.satisfies(process.version, '>=8.0.0')) {
  console.log('turning off fs instrumentation')
  ao.probes.fs.enabled = false
}

describe('probes.restify ' + pkg.version, function () {
  let emitter
  let fsState

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
  })
  after(function (done) {
    emitter.close(done)
    ao.probes.fs.enabled = fsState
  })

  const check = {
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
    const app = restify.createServer(opts)

    app.get('/hello/:name', function hello (req, res) {
      res.send('done')
    })

    const validations = [
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

    const server = app.listen(function () {
      const port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  }

  function testMiddleware (done) {
    const app = restify.createServer(opts)

    app.get('/hello/:name', function renamer (req, res, next) {
      req.name = req.params.name
      next()
    }, function responder (req, res) {
      res.send(req.name)
    })

    const validations = [
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

    const server = app.listen(function () {
      const port = server.address().port
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
