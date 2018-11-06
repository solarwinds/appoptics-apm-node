'use strict'

const helper = require('../helper')
const {ao} = require('../1.test-common.js')

const pkg = require('koa-router/package')

let canGenerator = false
try {
  eval('(function* () {})()')
  canGenerator = true
} catch (e) {
}

function noop () {}

describe('probes/koa-router ' + pkg.version, function () {
  let emitter
  const tests = canGenerator && require('./koa')
  let realSampleTrace

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'

    realSampleTrace = ao.addon.Context.sampleTrace
    ao.addon.Context.sampleTrace = function () {
      return {sample: true, source: 6, rate: ao.sampleRate}
    }

    ao.g.testing(__filename)
  })
  after(function (done) {
    ao.probes.fs.enabled = true

    ao.addon.Context.sampleTrace = realSampleTrace
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
        msg.should.have.property('Label').oneOf('entry', 'exit'),
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  //
  // Tests
  //
  if (!canGenerator) {
    it.skip('should support koa-router controllers', noop)
    it.skip('should skip when disabled', noop)
  } else {
    it('should support koa-router controllers', function (done) {
      tests.router(emitter, done)
    })
    it('should skip when disabled', function (done) {
      tests.router_disabled(emitter, done)
    })
  }
})
