/* global it, describe, before, after */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common')
ao.g.testing(__filename)

const assert = require('assert')

const koa = require('koa')
const pkg = require('koa/package')

let canGenerator = false
try {
  eval('(function* () {})()')
  canGenerator = true
} catch (e) {
}

function noop () {}

describe('probes/koa ' + pkg.version, function () {
  let emitter
  const tests = canGenerator && require('./koa')

  //
  // Intercept messages for analysis
  //
  before(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
  })

  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should allow creating the app with or without "new"', function () {
    let app
    let error = false
    try {
      app = new koa() // eslint-disable-line new-cap
    } catch (e) {
      error = e
    }
    assert(app !== undefined, 'a koa app should be returned')
    assert(error === false, 'should allow "new koa()"')

    app = undefined
    try {
      app = koa()
    } catch (e) {
      error = e
    }
    assert(app !== undefined, 'a koa app should be returned')
    assert(error === false, 'should allow "koa()"')
  })

  //
  // Tests
  //
  if (!canGenerator) {
    it.skip('should support koa outer span', noop)
    it.skip('should skip when disabled', noop)
  } else {
    it('should support koa outer span', function (done) {
      tests.basic(emitter, done)
    })
    it('should skip when disabled', function (done) {
      tests.disabled(emitter, done)
    })
  }
})
