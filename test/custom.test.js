var helper = require('./helper')
var tv = require('..')

//
//                 ^     ^
//            __--| \:::/ |___
//    __---```   /    ;;;  \  ``---___
//      -----__ |   (@  \\  )       _-`
//             ```--___   \\ \   _-`
//                     ````----``
//     /````\  /```\   /```\  |`\   ||
//     ||``\| |/```\| |/```\| ||\\  ||
//      \\    ||   || ||   || || || ||
//        \\  ||   || ||   || || || ||
//     |\__|| |\___/| |\___/| ||  \\||
//     \____/  \___/   \___/  ||   \_|
//
var soon = global.setImmediate || process.nextTick

// Without the native liboboe bindings present,
// the custom instrumentation should be a no-op
if ( ! tv.addon) {
  describe('custom', function () {
    it('should passthrough without addon', function (done) {
      tv.instrument('test', soon, done)
    })
  })
  return
}

describe('custom', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  beforeEach(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  afterEach(function (done) {
    emitter.close(done)
  })

  it('should custom instrument sync code', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrument('test', function () {})
      done()
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should custom instrument async code', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrument('test', soon, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should support builder function', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrument(function (last) {
        return last.descend('test', {
          Foo: 'bar'
        })
      }, soon, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Foo', 'bar')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should allow optional callback with async code', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrument('test', function (doneInner) {
        soon(function () {
          doneInner()
          done()
        })
      })
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should include backtrace, when collectBacktraces is on', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrument('test', soon, {
        collectBacktraces: true,
        enabled: true
      }, done)
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Backtrace')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should skip when not enabled', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrument('test', soon, {
        enabled: false
      }, done)
    }, [], done)
  })
})
