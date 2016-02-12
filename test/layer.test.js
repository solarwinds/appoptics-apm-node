var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon
var Layer = tv.Layer
var Event = tv.Event

describe('layer', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
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
      function (msg) {
        msg.should.have.property('X-Trace', e.entry.toString())
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Layer', name)

        Object.keys(data).forEach(function (key) {
          msg.should.have.property(key, data[key])
        })
      },
      function (msg) {
        msg.should.have.property('X-Trace', e.exit.toString())
        msg.should.have.property('Edge', e.entry.opId)
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Layer', name)
      }
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {

    })
  })

  it('should report async boundaries', function (done) {
    var name = 'test'
    var data = { Foo: 'bar' }
    var layer = new Layer(name, null, data)

    var e = layer.events

    var checks = [
      // Verify structure of entry event
      function (msg) {
        msg.should.have.property('X-Trace', e.entry.toString())
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Layer', name)

        Object.keys(data).forEach(function (key) {
          msg.should.have.property(key, data[key])
        })
      },
      // Verify structure of exit event
      function (msg) {
        msg.should.have.property('X-Trace', e.exit.toString())
        msg.should.have.property('Edge', e.entry.opId)
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Layer', name)
      }
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function (wrap) {
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
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'entry')

        Object.keys(outerData).forEach(function (key) {
          msg.should.have.property(key, outerData[key])
        })
      },
      function (msg) {
        msg.should.have.property('X-Trace', inner.events.entry.toString())
        msg.should.have.property('Edge', outer.events.entry.opId.toString())
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'entry')

        Object.keys(innerData).forEach(function (key) {
          msg.should.have.property(key, innerData[key])
        })
      },
      function (msg) {
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId.toString())
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', inner.events.exit.opId.toString())
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
      }
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
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'entry')

        Object.keys(outerData).forEach(function (key) {
          msg.should.have.property(key, outerData[key])
        })
      },
      // Inner entry (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner.events.entry.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'entry')

        Object.keys(innerData).forEach(function (key) {
          msg.should.have.property(key, innerData[key])
        })
      },
      // Outer exit
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
      },
      // Inner exit (async)
      function (msg) {
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      }
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
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.entry.toString())
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'entry')

        Object.keys(outerData).forEach(function (key) {
          msg.should.have.property(key, outerData[key])
        })
      },
      // Outer exit (async)
      function (msg) {
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
      },
      // Inner entry
      function (msg) {
        msg.should.have.property('X-Trace', inner.events.entry.toString())
        msg.should.have.property('Edge', outer.events.exit.opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'entry')

        Object.keys(innerData).forEach(function (key) {
          msg.should.have.property(key, innerData[key])
        })
      },
      // Inner exit
      function (msg) {
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      },
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
  // Miscellaneous
  //
  it('should send info events', function (done) {
    var layer = new Layer('test', null, {})
    var e = layer.events.entry
    var data = {
      Foo: 'bar'
    }

    var checks = [
      function () {},
      function (msg) {
        msg.should.not.have.property('Layer')
        msg.should.have.property('Label', 'info')
        Object.keys(data).forEach(function (key) {
          msg.should.have.property(key, data[key])
        })
      },
      function () {}
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

    function check (msg) {
      msg.should.not.have.property('Layer')
      msg.should.have.property('Label', 'info')
      Object.keys(data).forEach(function (key) {
        msg.should.have.property(key, data[key])
      })
    }

    helper.doChecks(emitter, [
      function () {},
      check,
      check,
      function () {}
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

  it('should chain internal event edges', function (done) {
    var layer = new Layer('test', null, {})

    var n = 10 + Math.floor(Math.random() * 10)
    var msgs = []

    function push (msg) {
      msgs.push(msg)
    }

    var checks = [ push, push ]
    for (var i = 0; i < n; i++) {
      checks.push(push)
    }

    helper.doChecks(emitter, checks, function (err) {
      if (err) return done(err)
      var prev = msgs.shift()
      msgs.forEach(function (event) {
        linksTo(event, prev)
        prev = event
      })
      done()
    })

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

    var track = edgeTracker()

    var checks = [
      checkEntry('outer', track),
        checkInfo(before, track),
        checkEntry('inner', track),
        checkExit('inner', track),
        checkInfo(after, track),
      checkExit('outer', track)
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

    var trackOuter = edgeTracker()
    var trackInner = edgeTracker()

    var checks = [
      checkEntry('outer', trackOuter),
        checkInfo(before, trackOuter),

        // Async call
        checkEntry('inner', trackInner),
        checkInfo(before, trackInner),

        checkInfo(after, trackOuter),
      checkExit('outer', trackOuter),

        // Next tick
        checkInfo(after, trackInner),
        checkExit('inner', trackInner)
    ]

    helper.doChecks(emitter, checks, done)

    layer.run(function () {
      layer.info(before)
      var sub = layer.descend('inner')
      sub.run(function (wrap) {
        var cb = wrap(function () {})
        setImmediate(function () {
          tv.reportInfo(after)
          cb()
        })
        tv.reportInfo(before)
      })
      layer.info(after)
    })
  })

})

function linksTo (a, b) {
  a.Edge.should.eql(b['X-Trace'].substr(42))
}

function edgeTracker () {
  var last = null
  return function (msg) {
    if (last) linksTo(msg, last)
    last = msg
  }
}

function checkEntry (name, fn) {
  return function (msg) {
    msg.should.have.property('X-Trace')
    msg.should.have.property('Label', 'entry')
    msg.should.have.property('Layer', name)
    if (fn) fn(msg)
  }
}

function checkExit (name, fn) {
  return function (msg) {
    msg.should.have.property('X-Trace')
    msg.should.have.property('Label', 'exit')
    msg.should.have.property('Layer', name)
    if (fn) fn(msg)
  }
}

function checkInfo (data, fn) {
  return function (msg) {
    msg.should.not.have.property('Layer')
    msg.should.have.property('Label', 'info')
    Object.keys(data).forEach(function (key) {
      msg.should.have.property(key, data[key])
    })
    if (fn) fn(msg)
  }
}
