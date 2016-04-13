var Emitter = require('events').EventEmitter
var helper = require('./helper')
var should = require('should')
var tv = require('..')
var Layer = tv.Layer
var Event = tv.Event

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

var fakeTaskId = '1234567890123456789012345678901234567890'
var fakeOpId = '1234567890123456'
var fakeId = '1B' + fakeTaskId + fakeOpId

// Without the native liboboe bindings present,
// the custom instrumentation should be a no-op
if ( ! tv.addon) {
  describe('custom (without native bindings present)', function () {
    it('should passthrough sync instrument', function () {
      var counter = 0
      tv.instrument('test', function () {
        counter++
      })
      counter.should.equal(1)
    })
    it('should passthrough async instrument', function (done) {
      tv.instrument('test', soon, 'foo', done)
    })

    it('should passthrough sync startOrContinueTrace', function () {
      var counter = 0
      tv.startOrContinueTrace(null, 'test', function () {
        counter++
      })
      counter.should.equal(1)
    })
    it('should passthrough async startOrContinueTrace', function (done) {
      tv.startOrContinueTrace(null, 'test', soon, done)
    })

    it('should support callback shifting', function (done) {
      tv.instrument('test', soon, done)
    })

    it('should not fail when accessing traceId', function () {
      tv.traceId
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
    helper.test(emitter, function (done) {
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
    helper.test(emitter, function (done) {
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
    helper.test(emitter, function (done) {
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
    helper.test(emitter, function (done) {
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
    helper.test(emitter, function (done) {
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
    helper.test(emitter, function (done) {
      tv.instrument('test', soon, {
        enabled: false
      }, done)
    }, [], done)
  })

  it('should report custom info events within a layer', function (done) {
    var data = { Foo: 'bar' }
    var last

    helper.test(emitter, function (done) {
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

    helper.test(emitter, function (done) {
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

    helper.test(emitter, function (done) {
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

  // Verify startOrContinueTrace creates a new trace when not already tracing.
  it('should start a fresh trace', function (done) {
    var last

    helper.doChecks(emitter, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('SampleSource')
        msg.should.have.property('SampleRate')
        msg.should.not.have.property('Edge')
        last = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], done)

    var test = 'foo'
    var res = tv.startOrContinueTrace(null, function (last) {
      return last.descend('test')
    }, function () {
      return test
    }, conf)

    res.should.equal(test)
  })

  // Verify startOrContinueTrace continues from provided trace id.
  it('should continue from previous trace id', function (done) {
    var last

    helper.doChecks(emitter, [
      function (msg) {
        msg.should.have.property('Layer', 'previous')
        msg.should.have.property('Label', 'entry')
        msg.should.not.have.property('Edge')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
        msg.should.not.have.property('SampleSource')
        msg.should.not.have.property('SampleRate')
        msg.Edge.should.equal(entry.opId)
        last = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
        last = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.have.property('Layer', 'previous')
        msg.should.have.property('Label', 'exit')
        msg.Edge.should.equal(last)
      }
    ], done)

    var previous = new Layer('previous')
    var entry = previous.events.entry
    previous.async = true
    previous.enter()

    // Clear context
    Layer.last = Event.last = null

    tv.startOrContinueTrace(entry.toString(), function (last) {
      return last.descend('test')
    }, function (cb) { cb() }, conf, function () {
      previous.exit()
    })
  })

  // Verify startOrContinueTrace continues from existing traces,
  // when already tracing, whether or not an xtrace if is provided.
  it('should continue outer traces when already tracing', function (done) {
    var prev, outer, sub

    helper.doChecks(emitter, [
      function (msg) {
        msg.should.have.property('Layer', 'previous')
        msg.should.have.property('Label', 'entry')
        msg.should.not.have.property('Edge')
        prev = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'entry')
        // SampleSource and SampleRate should NOT be here due to continuation
        msg.should.not.have.property('SampleSource')
        msg.should.not.have.property('SampleRate')
        msg.should.have.property('Edge', prev)
        outer = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'entry')
        // SampleSource and SampleRate should NOT be here due to continuation
        msg.should.not.have.property('SampleSource')
        msg.should.not.have.property('SampleRate')
        msg.should.have.property('Edge', outer)
        sub = msg['X-Trace'].substr(42)
      },
      function (msg) {
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Edge', sub)
      },
      function (msg) {
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Edge', outer)
      },
      function (msg) {
        msg.should.have.property('Layer', 'previous')
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Edge', prev)
      }
    ], done)

    var previous = new Layer('previous')
    var entry = previous.events.entry

    previous.run(function (wrap) {
      // Verify ID-less calls continue
      tv.startOrContinueTrace(null, 'outer', function (cb) {
        soon(function () {
          // Verify ID'd calls continue
          tv.startOrContinueTrace(entry.toString(), 'inner', function (cb) {
            cb()
          }, conf, cb)
        })
      }, conf, wrap(function () {}))
    })
  })

  // Verify startOrContinueTrace handles a false sample check correctly.
  it('should sample properly', function (done) {
    var realSample = tv.sample
    var called = false
    tv.sample = function () {
      called = true
      return false
    }

    helper.test(emitter, function (done) {
      Layer.last = Event.last = null
      tv.startOrContinueTrace(null, 'test', setImmediate, conf, done)
    }, [], function (err) {
      called.should.equal(true)
      tv.sample = realSample
      done(err)
    })
  })

  // Verify traceId getter works correctly
  it('should get traceId when tracing and null when not', function () {
    should.not.exist(tv.traceId)
    tv.startOrContinueTrace(null, 'test', function (cb) {
      should.exist(tv.traceId)
      cb()
    }, function () {
      should.exist(tv.traceId)
    })
    should.not.exist(tv.traceId)
  })

  it('should bind functions to requestStore', function () {
    var bind = tv.requestStore.bind
    var threw = false
    var called = false

    tv.requestStore.bind = function () {
      called = true
    }

    function noop () {}

    try {
      tv.bind(noop)
      called.should.equal(false)
      var layer = new tv.Layer('test', 'entry')
      layer.run(function () {
        tv.bind(null)
        called.should.equal(false)
        tv.bind(noop)
        called.should.equal(true)
      })
    } catch (e) {
      threw = true
    }

    tv.requestStore.bind = bind

    threw.should.equal(false)
  })

  it('should bind emitters to requestStore', function () {
    var bindEmitter = tv.requestStore.bindEmitter
    var threw = false
    var called = false

    tv.requestStore.bindEmitter = function () {
      called = true
    }

    var emitter = new Emitter

    try {
      tv.bindEmitter(emitter)
      called.should.equal(false)
      var layer = new tv.Layer('test', 'entry')
      layer.run(function () {
        tv.bindEmitter(null)
        called.should.equal(false)
        tv.bindEmitter(emitter)
        called.should.equal(true)
      })
    } catch (e) {
      threw = true
    }

    tv.requestStore.bindEmitter = bindEmitter

    threw.should.equal(false)
  })

})

function after (n, cb) {
  return function () {
    --n || cb()
  }
}
