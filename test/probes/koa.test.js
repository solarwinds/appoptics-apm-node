var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon

var pkg = require('koa/package')

var canGenerator = false
try {
  eval('(function* () {})()')
  canGenerator = true
} catch (e) {
}

function noop () {}

describe('probes/koa ' + pkg.version, function () {
  var emitter
  var tests = canGenerator && require('./koa')

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
  if ( ! canGenerator) {
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
