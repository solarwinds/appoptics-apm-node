var helper = require('./helper')
var should = require('should')
var tv = require('..')
var Layer = tv.Layer

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
    it('should passthrough sync instrumentation without addon', function () {
      var counter = 0
      tv.instrument('test', function () {
        counter++
      })
      counter.should.equal(1)
    })

    it('should passthrough async instrumentation without addon', function (done) {
      tv.instrument('test', soon, 'foo', done)
    })

    it('should support callback shifting', function (done) {
      tv.instrument('test', soon, done)
    })
  })
  return
}

describe('custom', function () {
  var conf = { enabled: true }
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

  it('should report custom info events within a layer', function (done) {
    var data = { Foo: 'bar' }
    var last

    helper.httpTest(emitter, function (done) {
      tv.instrument(function (layer) {
        return layer.descend('test')
      }, function (callback) {
        tv.reportInfo(data)
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
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Foo', 'bar')
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

  it('should link info events correctly', function (done) {
    var outer, inner = []

    var checks = [
      // Outer entry
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'entry')
      },
      // Inner entry #1 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[0].events.entry.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'entry')
      },
      // Inner info #1 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[0].events.internal[0].toString())
        msg.should.have.property('Edge', inner[0].events.entry.opId)
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Index', 0)
      },
      // Outer info
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.internal[0].toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Index', 1)
      },
      // Inner entry #2 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[1].events.entry.toString())
        msg.should.have.property('Edge', outer.events.internal[0].opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'entry')
      },
      // Inner info #2 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[1].events.internal[0].toString())
        msg.should.have.property('Edge', inner[1].events.entry.opId)
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Index', 2)
      },
      // Outer exit
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.internal[0].opId)
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
      },
      // Inner exit #1 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[0].events.exit.toString())
        msg.should.have.property('Edge', inner[0].events.internal[0].opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      },
      // Inner exit #2 (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner[1].events.exit.toString())
        msg.should.have.property('Edge', inner[1].events.internal[0].opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      },
    ]

    helper.httpTest(emitter, function (done) {
      function makeInner (data, done) {
        var layer = Layer.last.descend('inner')
        inner.push(layer)
        layer.run(function (wrap) {
          var delayed = wrap(done)
          tv.reportInfo(data)
          process.nextTick(function () {
            delayed()
          })
        })
      }

      outer = Layer.last.descend('outer')
      outer.run(function () {
        var cb = after(2, done)
        makeInner({
          Index: 0
        }, cb)
        tv.reportInfo({
          Index: 1
        })
        makeInner({
          Index: 2
        }, cb)
      })
    }, checks, done)
  })

  it('should report partitioned layers', function (done) {
    var data = { Foo: 'bar', Partition: 'bar' }
    var last

    helper.httpTest(emitter, function (done) {
      tv.instrument(function (layer) {
        return layer.descend('test')
      }, function (callback) {
        tv.reportInfo(data)
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
        msg.should.have.property('Label', 'info')
        msg.should.have.property('Foo', 'bar')
        msg.should.have.property('Partition', 'bar')
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

})

function after (n, cb) {
  return function () {
    --n || cb()
  }
}
