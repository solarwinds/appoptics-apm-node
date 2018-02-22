var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon

var should = require('should')
var semver = require('semver')
var request = require('request')
var http = require('http')

var director = require('director')
var pkg = require('director/package.json')

describe('probes.director', function () {
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
    'director-entry': function (msg) {
      msg.should.have.property('Layer', 'director')
      msg.should.have.property('Label', 'entry')
    },
    'director-exit': function (msg) {
      msg.should.have.property('Layer', 'director')
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
  it('should include director layer and profiles', function (done) {
    function hello (name) {
      this.res.writeHead(200, { 'Content-Type': 'text/plain' })
      this.res.end('Hello, ' + name + '!')
    }

    var router = new director.http.Router({
      '/hello/:name': { get: hello }
    })

    var server = http.createServer(function (req, res) {
      router.dispatch(req, res, function (err) {
        if (err) {
          res.writeHead(404)
          res.end()
        }
      })
    })

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['director-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Label', 'profile_entry')
        msg.should.have.property('ProfileName', '/hello/:name hello')
        msg.should.have.property('Controller', '/hello/:name')
        msg.should.have.property('Action', 'hello')
      },
      function (msg) {
        msg.should.have.property('Label', 'profile_exit')
        msg.should.have.property('ProfileName', '/hello/:name hello')
      },
      function (msg) {
        check['director-exit'](msg)
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

    server.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

  it('should skip when disabled', function (done) {
    ao.probes.director.enabled = false
    function hello (name) {
      this.res.writeHead(200, { 'Content-Type': 'text/plain' })
      this.res.end('Hello, ' + name + '!')
    }

    var router = new director.http.Router({
      '/hello/:name': { get: hello }
    })

    var server = http.createServer(function (req, res) {
      router.dispatch(req, res, function (err) {
        if (err) {
          res.writeHead(404)
          res.end()
        }
      })
    })

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.not.have.property('Controller')
        msg.should.not.have.property('Action')
      }
    ]
    helper.doChecks(emitter, validations, function () {
      ao.probes.director.enabled = true
      server.close(done)
    })

    server.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port + '/hello/world')
    })
  })

})
