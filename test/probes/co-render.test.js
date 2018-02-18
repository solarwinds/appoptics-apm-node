var helper = require('../helper')
var ao = helper.ao

// Check for generator support
var canGenerator = false
try {
  eval('(function* () {})()')
  canGenerator = true
} catch (e) {
}

function noop () {}

describe('probes/co-render', function () {
  var emitter
  var tests = canGenerator && require('./koa')

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    ao.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
  })
  after(function (done) {
    ao.fs.enabled = true
    emitter.close(done)
  })

  //
  // Tests
  //
  if ( ! canGenerator) {
    it.skip('should support co-render', noop)
    it.skip('should skip when disabled', noop)
    it.skip('should include RUM scripts', noop)
  } else {
    it('should support co-render', function (done) {
      tests.render(emitter, done)
    })
    it('should skip when disabled', function (done) {
      tests.render_disabled(emitter, done)
    })
    it('should include RUM scripts', function (done) {
      tests.rum(emitter, done)
    })
  }
})
