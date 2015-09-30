var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var semver = require('semver')

var request = require('request')
var express = require('express')
var body = require('body-parser')

describe('probes.raw-body', function () {
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

})
