var helper = require('./helper')
var should = require('should')
var ao = require('..')
var addon = ao.addon
var Layer = ao.Layer
var Event = ao.Event

describe('layer', function () {
  var emitter
  var realSampleTrace

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    realSampleTrace = ao.addon.Context.sampleTrace
    ao.addon.Context.sampleTrace = function () {
      return { sample: true, source: 6, rate: ao.sampleRate }
    }
  })
  after(function (done) {
    ao.addon.Context.sampleTrace = realSampleTrace
    emitter.close(done)
  })

  //
  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  //
  it('might lose a message (until the UDP problem is fixed)', function (done) {
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
  // Verify basic structural integrity
  //
  it('should construct valid layer', function () {
    var layer = new Layer('test', null, {})

    layer.should.have.property('events')
    var events = ['entry','exit']
    events.forEach(function (event) {
      layer.events.should.have.property(event)
      layer.events[event].taskId.should.not.match(/^0*$/)
      layer.events[event].opId.should.not.match(/^0*$/)
    })
  })

  //
  // Verify base layer reporting
  //
  it('should report sync boundaries', function (done) {
    var name = 'test'
    var data = { Foo: 'bar' }
    var layer = new Layer(name, null, data)

    var e = layer.events

    var checks = [
      helper.checkEntry(name, helper.checkData(data, function (msg) {
        msg.should.have.property('X-Trace', e.entry.toString())
      })),
      helper.checkExit(name, function (msg) {
        msg.should.have.property('X-Trace', e.exit.toString())
        msg.should.have.property('Edge', e.entry.opId)
      })
    ]

    helper.doChecks(emitter, checks, done)

    layer.runSync(function () {

    })
  })

  it('should report async boundaries', function (done) {
    var name = 'test'
    var data = { Foo: 'bar' }
    var layer = new Layer(name, null, data)

    var e = layer.events

    var checks = [
      // Verify structure of entry event
      helper.checkEntry(name, helper.checkData(data, function (msg) {
        msg.should.have.property('X-Trace', e.entry.toString())
      })),
      // Verify structure of exit event
      helper.checkExit(name, function (msg) {
        msg.should.have.property('X-Trace', e.exit.toString())
        msg.should.have.property('Edge', e.entry.opId)
      })
    ]

    helper.doChecks(emitter, checks, done)

    layer.runAsync(function (wrap) {
      var cb = wrap(function (err, res) {
        should.not.exist(err)
        res.should.equal('foo')
      })

      process.nextTick(function () {
        cb(null, 'foo')
      })
    })
  })

  //
  // Verify behaviour when reporting nested layers
  //
  it('should report nested sync boundaries', function (done) {
    var outerData = { Foo: 'bar' }
    var innerData = { Baz: 'buz' }
    var outer, inner

    var checks = [
      helper.checkEntry('outer', helper.checkData(outerData, function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
      })),
      helper.checkEntry('inner', helper.checkData(innerData, function (msg) {
        msg.should.have.property('X-Trace', inner.events.entry.toString())
        msg.should.have.property('Edge', outer.events.entry.opId.toString())
      })),
      helper.checkExit('inner', function (msg) {
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId.toString())
      }),
      helper.checkExit('outer', function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', inner.events.exit.opId.toString())
      })
    ]

    helper.doChecks(emitter, checks, done)

    outer = new Layer('outer', null, outerData)
    outer.run(function () {
      inner = Layer.last.descend('inner', innerData)
      inner.run(function () {})
    })
  })

  it('should report nested boundaries of async event within sync event', function (done) {
    var outerData = { Foo: 'bar' }
    var innerData = { Baz: 'buz' }
    var outer, inner

    var checks = [
      // Outer entry
      helper.checkEntry('outer', helper.checkData(outerData, function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
      })),
      // Inner entry (async)
      helper.checkEntry('inner', helper.checkData(innerData, function (msg) {
        msg.should.have.property('X-Trace', inner.events.entry.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
      })),
      // Outer exit
      helper.checkExit('outer', function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
      }),
      // Inner exit (async)
      helper.checkExit('inner', function (msg) {
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId)
      })
    ]

    helper.doChecks(emitter, checks, done)

    outer = new Layer('outer', null, outerData)
    outer.run(function () {
      inner = Layer.last.descend('inner', innerData)
      inner.run(function (wrap) {
        var delayed = wrap(function (err, res) {
          should.not.exist(err)
          should.exist(res)
          res.should.equal('foo')
        })

        process.nextTick(function () {
          delayed(null, 'foo')
        })
      })
    })
  })

  it('should report nested boundaries of sync event within async event', function (done) {
    var outerData = { Foo: 'bar' }
    var innerData = { Baz: 'buz' }
    var outer, inner

    var checks = [
      // Outer entry (async)
      helper.checkEntry('outer', helper.checkData(outerData, function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
      })),
      // Outer exit (async)
      helper.checkExit('outer', function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
      }),
      // Inner entry
      helper.checkEntry('inner', helper.checkData(innerData, function (msg) {
        msg.should.have.property('X-Trace', inner.events.entry.toString())
        msg.should.have.property('Edge', outer.events.exit.opId)
      })),
      // Inner exit
      helper.checkExit('inner', function (msg) {
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId)
      })
    ]

    helper.doChecks(emitter, checks, done)

    outer = new Layer('outer', null, outerData)
    outer.run(function (wrap) {
      var delayed = wrap(function (err, res) {
        should.not.exist(err)
        should.exist(res)
        res.should.equal('foo')

        inner = Layer.last.descend('inner', innerData)
        inner.run(function () {

        })
      })

      process.nextTick(function () {
        delayed(null, 'foo')
      })
    })
  })

  //
  // Special events
  //
  it('should send info events', function (done) {
    var layer = new Layer('test', null, {})
    var data = {
      Foo: 'bar'
    }

    var checks = [
      helper.checkEntry('test'),
      helper.checkInfo(data),
      helper.checkExit('test'),
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {
      layer.info(data)
    })
  })

  it('should send error events', function (done) {
    var layer = new Layer('test', null, {})
    var err = new Error('nope')

    var checks = [
      helper.checkEntry('test'),
      helper.checkError(err),
      helper.checkExit('test'),
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {
      layer.error(err)
    })
  })

  it('should support setting an exit error', function () {
    // Proper errors should work
    var a = new Layer('test', null, {})
    var aExit = a.events.exit
    var err = new Error('nope')
    a.setExitError(err)
    aExit.should.have.property('ErrorClass', 'Error')
    aExit.should.have.property('ErrorMsg', err.message)
    aExit.should.have.property('Backtrace', err.stack)

    // As should error strings
    var b = new Layer('test', null, {})
    var bExit = b.events.exit
    b.setExitError('nope')
    bExit.should.have.property('ErrorClass', 'Error')
    bExit.should.have.property('ErrorMsg', 'nope')
  })

  //
  // Safety and correctness
  //
  it('should only send valid properties', function (done) {
    var layer = new Layer('test', null, {})
    var e = layer.events.entry
    var data = {
      Array: [],
      Object: { bar: 'baz' },
      Function: function () {},
      Date: new Date,
      String: 'bix'
    }

    var expected = {
      String: 'bix'
    }

    var checks = [
      helper.checkEntry('test'),
      helper.checkInfo(expected, function (msg) {
        msg.should.not.have.property('Object')
        msg.should.not.have.property('Array')
        msg.should.not.have.property('Function')
        msg.should.not.have.property('Date')
      }),
      helper.checkExit('test'),
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {
      layer.info(data)
    })
  })

  it('should not send info events when not in a layer', function () {
    var layer = new Layer('test', null, {})
    var data = { Foo: 'bar' }

    var send = Event.prototype.send
    Event.prototype.send = function () {
      Event.prototype.send = send
      throw new Error('should not send when not in a layer')
    }

    layer.info(data)
    Event.prototype.send = send
  })

  it('should allow sending the same info data multiple times', function (done) {
    var layer = new Layer('test', null, {})
    var e = layer.events.entry
    var data = {
      Foo: 'bar'
    }

    helper.doChecks(emitter, [
      helper.checkEntry('test'),
      helper.checkInfo(data),
      helper.checkInfo(data),
      helper.checkExit('test'),
    ], done)

    layer.run(function () {
      layer.info(data)
      layer.info(data)
    })
  })

  it('should fail silently when sending non-object-literal info', function () {
    var layer = new Layer('test', null, {})
    layer._internal = function () {
      throw new Error('should not have triggered an _internal call')
    }
    layer.info(undefined)
    layer.info(new Date)
    layer.info(/foo/)
    layer.info('wat')
    layer.info(null)
    layer.info([])
    layer.info(1)
  })

  //
  // Structural integrity
  //
  it('should chain internal event edges', function (done) {
    var n = 10 + Math.floor(Math.random() * 10)
    var layer = new Layer('test', null, {})
    var tracker = helper.edgeTracker()

    var checks = [ tracker, tracker ]
    for (var i = 0; i < n; i++) {
      checks.push(tracker)
    }

    helper.doChecks(emitter, checks, done)

    function sendAThing (i) {
      if (Math.random() > 0.5) {
        layer.error(new Error('error ' + i))
      } else {
        layer.info({ index: i })
      }
    }

    layer.run(function () {
      for (var i = 0; i < n; i++) {
        sendAThing(i)
      }
    })
  })

  it('should chain internal events around sync sub layer', function (done) {
    var layer = new Layer('outer', null, {})

    var before = { state: 'before' }
    var after = { state: 'after' }

    var track = helper.edgeTracker()

    var checks = [
      helper.checkEntry('outer', track),
        helper.checkInfo(before, track),
        helper.checkEntry('inner', track),
        helper.checkExit('inner', track),
        helper.checkInfo(after, track),
      helper.checkExit('outer', track)
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {
      layer.info(before)
      layer.descend('inner').run(function () {
        // Do nothing
      })
      layer.info(after)
    })
  })

  it('should chain internal events around async sub layer', function (done) {
    var layer = new Layer('outer', null, {})

    var before = { state: 'before' }
    var after = { state: 'after' }

    var trackOuter = helper.edgeTracker()
    var trackInner = helper.edgeTracker()

    var checks = [
      helper.checkEntry('outer', trackOuter),
        helper.checkInfo(before, trackOuter),

        // Async call
        helper.checkEntry('inner', trackInner),
        helper.checkInfo(before, trackInner),

        helper.checkInfo(after, trackOuter),
      helper.checkExit('outer', trackOuter),

        // Next tick
        helper.checkInfo(after, trackInner),
        helper.checkExit('inner', trackInner)
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {
      layer.info(before)
      var sub = layer.descend('inner')
      sub.run(function (wrap) {
        var cb = wrap(function () {})
        setImmediate(function () {
          ao.reportInfo(after)
          cb()
        })
        ao.reportInfo(before)
      })
      layer.info(after)
    })
  })

  it('should properly attribute dangling info/error events', function (done) {
    var layer = new Layer('outer', null, {})

    var before = { state: 'before' }
    var after = { state: 'after' }
    var error = new Error('wat')

    var trackOuter = helper.edgeTracker()
    var trackInner1 = helper.edgeTracker(trackOuter)
    var trackInner2 = helper.edgeTracker(trackInner1)
    var trackInner3 = helper.edgeTracker(trackInner1)
    var trackInner4 = helper.edgeTracker(trackInner3)

    // The weird indentation is to match depth of trigerring code,
    // it might make it easier to match a layer entry to its exit.
    var checks = [
      // Start async outer
      helper.checkEntry('outer', trackOuter),

        // Start sync inner-1
        helper.checkEntry('inner-1', trackInner1),

          // Start async inner-3, surrounded by info events
          helper.checkInfo(before, trackInner1),
          helper.checkEntry('inner-3', trackInner3),
          helper.checkInfo(after, trackInner1),

        // Finish sync inner-1
        helper.checkExit('inner-1', trackInner1),

        // Start async inner-2
        helper.checkEntry('inner-2', trackInner2),

          // Finish async inner-3
          helper.checkExit('inner-3', trackInner3),

            // Start async inner-4
            helper.checkError(error, trackInner3),
            helper.checkEntry('inner-4', trackInner4),

        // Finish async inner-2
        helper.checkExit('inner-2', trackInner2),

      // Finish async outer
      helper.checkExit('outer', trackInner2),

            // Finish async inner-4
            helper.checkExit('inner-4', trackInner4),
    ]

    helper.doChecks(emitter, checks, done)

    ao.requestStore.run(function () {
      layer.enter()
      var sub1 = layer.descend('inner-1')
      sub1.run(function () {
        ao.reportInfo(before)

        var sub2 = layer.descend('inner-3')
        sub2.run(function (wrap) {
          setImmediate(wrap(function () {
            ao.reportError(error)

            var sub2 = layer.descend('inner-4')
            sub2.run(function (wrap) {
              setImmediate(wrap(function () {}))
            })
          }))
        })

        ao.reportInfo(after)
      })

      var sub2 = layer.descend('inner-2')
      sub2.run(function (wrap) {
        setTimeout(wrap(function () {
          layer.exit()
        }), 1)
      })
    })
  })

})
