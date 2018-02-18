var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon

var should = require('should')
var semver = require('semver')

var request = require('request')
var express = require('express')
var body = require('body-parser')
var rawBody = require('raw-body')
var version = require('raw-body/package.json').version
var ReadableStream = require('stream').Readable

describe('probes.raw-body', function () {
  var emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    ao.fs.enabled = false
    ao.Layer.last = null
    ao.Event.last = null
  })
  after(function (done) {
    ao.fs.enabled = true
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
    }
  }

  //
  // Tests
  //
  it('should support body-parser layer', function (done) {
    var app = express()

    // Attach body parsers
    app.use(body.urlencoded({ extended: false }))
    app.use(body.json())

    app.use(function (req, res) {
      res.send('done')
    })

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['express-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Layer', 'body-parser')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'body-parser')
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

    var server = app.listen(function () {
      var port = server.address().port
      request.post('http://localhost:' + port, {
        form: {
          key: 'value'
        }
      })
    })
  })

  if (semver.satisfies(version, '< 2')) {
    it.skip('should support promises', test_promises)
    it('should support thunks', test_thunks)
  } else {
    it('should support promises', test_promises)
    it.skip('should support thunks', test_thunks)
  }

  function makeStream () {
    return new ReadableStream({
      read: function () {
        this.push('hi')
        this.push(null)
        return false
      }
    })
  }

  function testStyle (done, runner) {
    var validations = [
      function (msg) {
        msg.should.have.property('Layer', 'body-parser')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'body-parser')
        msg.should.have.property('Label', 'exit')
      }
    ]

    helper.test(emitter, runner, validations, done)
  }

  function test_promises (done) {
    testStyle(done, function (done) {
      rawBody(makeStream(), {
        length: 2,
        limit: '1mb'
      }).then(
        done.bind(null, null),
        done
      )
    })
  }

  function test_thunks (done) {
    testStyle(done, function (done) {
      rawBody(makeStream(), {
        length: 2,
        limit: '1mb'
      })(done)
    })
  }

})
