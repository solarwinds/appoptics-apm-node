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

describe('probes.koa', function () {
  var emitter
  var tests = canGenerator && require('./koa')

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

  //
  // Tests
  //
  if ( ! canGenerator) {
    it.skip('should support koa-route controllers', noop)
    it.skip('should support koa-router controllers', noop)
    it.skip('should support koa-resource-router controllers', noop)
    it.skip('should support co-render', noop)
    it.skip('should include RUM scripts', noop)
  } else {
    it('should support koa-route controllers', function (done) {
      tests.route(emitter, done)
    })
    it('should support koa-router controllers', function (done) {
      tests.router(emitter, done)
    })
    it('should support koa-resource-router controllers', function (done) {
      tests.resourceRouter(emitter, done)
    })
    it('should support co-render', function (done) {
      tests.render(emitter, done)
    })
    it('should include RUM scripts', function (done) {
      tests.rum(emitter, done)
    })
  }
})
