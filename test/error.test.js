var helper = require('./helper')
var tv = require('..')
var Event = tv.Event

describe('error', function () {
  var conf = { enabled: true }
  var error = new Error('nope')
  var emitter

  function testLayer (layer) {
    return layer.descend('test')
  }

  function handleErrorTest (task, done) {
    helper.httpTest(emitter, task, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg', error.message)
        msg.should.have.property('Backtrace', error.stack)
      }
    ], done)
  }

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
  it('should add error properties to event', function () {
    var event = new Event('error-test', 'info')
    var err = new Error('test')
    event.error = err

    event.should.have.property('ErrorClass', 'Error')
    event.should.have.property('ErrorMsg', err.message)
    event.should.have.property('Backtrace', err.stack)
  })

  it('should report errors in sync calls', function (done) {
    handleErrorTest(function (done) {
      try {
        tv.instrument(testLayer, function () {
          throw error
        }, conf)
      } catch (e) {}
      done()
    }, done)
  })

  it('should report errors in error-first callbacks', function (done) {
    handleErrorTest(function (done) {
      tv.instrument(testLayer, function (callback) {
        callback(error)
      }, conf, function () {
        done()
      })
    }, done)
  })

})
