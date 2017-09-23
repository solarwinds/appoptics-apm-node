var helper = require('./helper')
var ao = require('..')
var Layer = ao.Layer
var Event = ao.Event

describe('error', function () {
  var conf = { enabled: true }
  var error = new Error('nope')
  var emitter

  function testLayer (layer) {
    return layer.descend('test')
  }

  function handleErrorTest (task, done) {
    helper.test(emitter, task, [
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
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
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

  it('should set error multiple times (keeping last)', function () {
    var event = new Event('error-test', 'info')
    var first = new Error('first')
    var second = new Error('second')
    event.error = first
    event.error = second

    event.should.have.property('ErrorClass', 'Error')
    event.should.have.property('ErrorMsg', second.message)
    event.should.have.property('Backtrace', second.stack)
  })

  it('should report errors in sync calls', function (done) {
    handleErrorTest(function (done) {
      try {
        ao.instrument(testLayer, function () {
          throw error
        }, conf)
      } catch (e) {}
      done()
    }, done)
  })

  it('should report errors in error-first callbacks', function (done) {
    handleErrorTest(function (done) {
      ao.instrument(testLayer, function (callback) {
        callback(error)
      }, conf, function () {
        done()
      })
    }, done)
  })

  it('should report custom errors', function (done) {
    var error = new Error('test')
    helper.test(emitter, function (done) {
      ao.reportError(error)
      done()
    }, [
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'error')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg', error.message)
        msg.should.have.property('Backtrace', error.stack)
      }
    ], done)
  })

  it('should report custom errors within a layer', function (done) {
    var error = new Error('test')
    var last

    helper.test(emitter, function (done) {
      ao.instrument(testLayer, function (callback) {
        ao.reportError(error)
        callback()
      }, conf, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
        last = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'error')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg', error.message)
        msg.should.have.property('Backtrace', error.stack)
        msg.Edge.should.equal(last)
        last = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], done)
  })

  it('should rethrow errors in sync calls', function (done) {
    handleErrorTest(function (done) {
      var rethrow = false
      try {
        ao.instrument(testLayer, function () {
          throw error
        }, conf)
      } catch (e) {
        rethrow = e === error
      }
      if ( ! rethrow) {
        throw new Error('did not rethrow')
      }
      done()
    }, done)
  })

  it('should support string errors', function (done) {
    var error = 'test'
    helper.httpTest(emitter, function (done) {
      ao.reportError(error)
      done()
    }, [
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'error')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg', error)
        msg.should.have.property('Backtrace')
      }
    ], done)
  })

  it('should support empty string errors', function (done) {
    var error = ''
    helper.httpTest(emitter, function (done) {
      ao.reportError(error)
      done()
    }, [
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'error')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg', error)
        msg.should.have.property('Backtrace')
      }
    ], done)
  })

  it('should fail silently when given non-error, non-string types', function () {
    var layer = new Layer('test', null, {})
    layer._internal = function () {
      throw new Error('should not have triggered an _internal call')
    }
    layer.error({ foo: 'bar' })
    layer.error(undefined)
    layer.error(new Date)
    layer.error(/foo/)
    layer.error(null)
    layer.error([])
    layer.error(1)
  })

  it('should allow sending the same error multiple times', function (done) {
    var error = new Error('dupe')

    // TODO: validate edge chaining
    function validate (msg) {
      msg.should.not.have.property('Layer')
      msg.should.have.property('Label', 'error')
      msg.should.have.property('ErrorClass', 'Error')
      msg.should.have.property('ErrorMsg', error.message)
      msg.should.have.property('Backtrace', error.stack)
    }

    helper.httpTest(emitter, function (done) {
      ao.reportError(error)
      ao.reportError(error)
      done()
    }, [ validate, validate ], done)
  })

  it('should not send error events when not in a layer', function () {
    var layer = new Layer('test', null, {})

    var send = Event.prototype.send
    Event.prototype.send = function () {
      Event.prototype.send = send
      throw new Error('should not send when not in a layer')
    }

    layer.error(error)
    Event.prototype.send = send
  })

})
