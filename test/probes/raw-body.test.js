'use strict'

const helper = require('../helper')
const {ao} = require('../1.test-common')

const semver = require('semver')

const request = require('request')
const express = require('express')
const body = require('body-parser')
const rawBody = require('raw-body')
const pkg = require('raw-body/package.json')
const ReadableStream = require('stream').Readable

describe('probes.raw-body ' + pkg.version, function () {
  let emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    ao.probes.fs.enabled = false
    ao.Span.last = null
    ao.Event.last = null
    ao.g.testing(__filename)
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
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
    'express-entry': function (msg) {
      msg.should.have.property('Layer', 'express')
      msg.should.have.property('Label', 'entry')
    },
    'express-exit': function (msg) {
      msg.should.have.property('Layer', 'express')
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
  it('should support body-parser span', function (done) {
    const app = express()

    // Attach body parsers
    app.use(body.urlencoded({extended: false}))
    app.use(body.json())

    app.use(function (req, res) {
      res.send('done')
    })

    const validations = [
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

    const server = app.listen(function () {
      const port = server.address().port
      request.post('http://localhost:' + port, {
        form: {
          key: 'value'
        }
      })
    })
  })

  if (semver.satisfies(pkg.version, '< 2')) {
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
    const validations = [
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
