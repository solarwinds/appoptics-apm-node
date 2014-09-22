var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon
var Layer = tv.Layer

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

  function doChecks (checks, done) {
    emitter.on('message', function (msg) {
      var check = checks.shift()
      if (check) {
        check(msg)
      }

      if ( ! checks.length) {
        emitter.removeAllListeners('message')
        done()
      }
    })
  }

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
        // msg.should.match(new RegExp('X-Trace\\W*1B' + e.entry.taskId, 'i'))
        msg.should.have.property('X-Trace', e.exit.toString())
        msg.should.have.property('Edge', e.entry.opId)
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Layer', name)
      }
    ]

    doChecks(checks, done)

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
        // msg.should.match(new RegExp('X-Trace\\W*1B' + e.entry.taskId, 'i'))
        msg.should.have.property('X-Trace', e.exit.toString())
        msg.should.have.property('Edge', e.entry.opId)
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Layer', name)
      }
    ]

    doChecks(checks, done)

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
        // msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.have.property('X-Trace', inner.events.entry.toString())
        msg.should.have.property('Edge', outer.events.entry.opId.toString())
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'entry')

        Object.keys(innerData).forEach(function (key) {
          msg.should.have.property(key, innerData[key])
        })
      },
      function (msg) {
        // msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.entry.taskId))
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId.toString())
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      },
      function (msg) {
        // msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', inner.events.exit.opId.toString())
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
      }
    ]

    doChecks(checks, done)

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
        // msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
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
        // msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
      },
      // Inner exit (async)
      function (msg) {
        // msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.exit.taskId))
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      }
    ]

    doChecks(checks, done)

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
        // msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.have.property('X-Trace', outer.events.exit.toString())
        msg.should.have.property('Edge', outer.events.entry.opId)
        msg.should.have.property('Layer', 'outer')
        msg.should.have.property('Label', 'exit')
      },
      // Inner entry
      function (msg) {
        // msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
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
        // msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.entry.taskId))
        msg.should.have.property('X-Trace', inner.events.exit.toString())
        msg.should.have.property('Edge', inner.events.entry.opId)
        msg.should.have.property('Layer', 'inner')
        msg.should.have.property('Label', 'exit')
      },
    ]

    doChecks(checks, done)

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
})
