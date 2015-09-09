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

describe('probes/koa-route', function () {
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
  } else {
    it('should support koa-route controllers', function (done) {
      tests.route(emitter, done)
    })
  }
})
