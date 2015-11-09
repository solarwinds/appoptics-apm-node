var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon


var canGenerator = false
try {
  eval('(function* () {})()')
  canGenerator = true
} catch (e) {
}

function noop () {}

describe('probes/koa-router', function () {
  var emitter
  var tests = canGenerator && require('./koa')

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

  //
  // Tests
  //
  if ( ! canGenerator) {
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
