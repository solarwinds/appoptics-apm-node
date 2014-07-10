var Emitter = require('events').EventEmitter
var should = require('should')
var dgram = require('dgram')

var oboe = require('..')
var addon = oboe.addon
var Layer = oboe.Layer
oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE

describe('layer', function () {
  var server = dgram.createSocket('udp4')
  var emitter = new Emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter.on('error', server.close.bind(server))

    server.on('message', emitter.emit.bind(emitter, 'message'))
    server.on('error', emitter.emit.bind(emitter, 'error'))
    server.on('listening', done)

    server.bind(1234)

    // Connect to test server
    oboe.reporter = new addon.UdpReporter('127.0.0.1', 1234)
  })

  after(function (done) {
    server.on('close', done)
    server.close()
  })

  //
  // Verify basic structural integrity
  //
  it('should construct valid layer', function () {
    var layer = new Layer('test', null, {})

    layer.should.have.property('events')
    layer.events.should.have.property('entry')
    layer.events.should.have.property('exit')
    layer.events.entry.taskId.should.not.match(/^0*$/)
    layer.events.entry.opId.should.not.match(/^0*$/)
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
        msg = msg.toString()
        msg.should.match(new RegExp('X-Trace\\W*' + e.entry, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name, 'i'))
        msg.should.match(/Label\W*entry/)

        Object.keys(data).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + data[key], 'i'))
        })
      },
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + e.entry.taskId, 'i'))
        msg.should.match(new RegExp('X-Trace\\W*' + e.exit, 'i'))
        msg.should.match(new RegExp('Edge\\W*' + e.entry.opId, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name, 'i'))
        msg.should.match(/Label\W*exit/)
        emitter.removeAllListeners('message')
        done()
      }
    ]

    emitter.on('message', function (msg) {
      checks.shift()(msg.toString())
    })

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
        msg.should.match(new RegExp('X-Trace\\W*' + e.entry, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name, 'i'))
        msg.should.match(/Label[^\s]*entry/)

        Object.keys(data).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + data[key], 'i'))
        })
      },
      // Verify structure of async entry event
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + e.entry.taskId, 'i'))
        msg.should.match(new RegExp('X-Trace\\W*' + e.asyncEntry, 'i'))
        msg.should.match(new RegExp('Edge\\W*' + e.entry.opId, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name + ' \\(callback\\)', 'i'))
        msg.should.match(/Label[^\s]*entry/)
      },
      // Verify structure of async exit event
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + e.entry.taskId, 'i'))
        msg.should.match(new RegExp('X-Trace\\W*' + e.asyncExit, 'i'))
        msg.should.match(new RegExp('Edge\\W*' + e.asyncEntry.opId, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name + ' \\(callback\\)', 'i'))
        msg.should.match(/Label[^\s]*exit/)
      },
      // Verify structure of exit event
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + e.entry.taskId, 'i'))
        msg.should.match(new RegExp('X-Trace\\W*' + e.exit, 'i'))
        msg.should.match(new RegExp('Edge\\W*' + e.entry.opId, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name, 'i'))
        msg.should.match(/Label[^\s]*exit/)

        // NOTE: It seems exit does NOT edge back to async exit
        // msg.should.match(new RegExp('Edge[^\\s]*' + e.asyncExit.opId, 'i'))

        // Cleanup and end test
        emitter.removeAllListeners('message')
        done()
      }
    ]

    emitter.on('message', function (msg) {
      checks.shift()(msg.toString())
    })

    layer.run(function (wrap) {
      var cb = wrap(function (err, res) {
        should.not.exist(err)
        res.should.equal('foo')
      })

      setImmediate(function () {
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
        msg.should.match(new RegExp('X-Trace\\W*' + outer.events.entry))
        msg.should.match(/Layer\W*outer/)
        msg.should.match(/Label\W*entry/)

        Object.keys(outerData).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + outerData[key]))
        })
      },
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.entry))
        msg.should.match(new RegExp('Edge\\W*' + outer.events.entry.opId))
        msg.should.match(/Layer\W*inner/)
        msg.should.match(/Label\W*entry/)

        Object.keys(innerData).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + innerData[key]))
        })
      },
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.exit))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.entry.opId))
        msg.should.match(/Layer\W*inner/)
        msg.should.match(/Label\W*exit/)
      },
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + outer.events.exit))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.exit.opId))
        msg.should.match(/Layer\W*outer/)
        msg.should.match(/Label\W*exit/)
        emitter.removeAllListeners('message')
        done()
      }
    ]

    emitter.on('message', function (msg) {
      checks.shift()(msg.toString())
    })

    outer = new Layer('outer', null, outerData)
    outer.run(function () {
      inner = Layer.last.descend('inner', innerData)
      inner.run(function () {})
    })
  })

  it('should report nested boundaries of async event with sync event', function (done) {
    var outerData = { Foo: 'bar' }
    var innerData = { Baz: 'buz' }
    var outer, inner

    var checks = [
      // Outer entry
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*' + outer.events.entry))
        msg.should.match(/Layer\W*outer/)
        msg.should.match(/Label\W*entry/)

        Object.keys(outerData).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + outerData[key]))
        })
      },
      // Inner entry (async)
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.entry))
        msg.should.match(new RegExp('Edge\\W*' + outer.events.entry.opId))
        msg.should.match(/Layer\W*inner/)
        msg.should.match(/Label\W*entry/)

        Object.keys(innerData).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + innerData[key]))
        })
      },
      // Outer exit
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + outer.events.exit))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.exit.opId))
        msg.should.match(/Layer\W*outer/)
        msg.should.match(/Label\W*exit/)
      },
      // Inner entry (async callback)
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.asyncEntry))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.entry.opId))
        msg.should.match(/Layer\W*inner \(callback\)/)
        msg.should.match(/Label\W*entry/)
      },
      // Inner exit (async callback)
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.asyncEntry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.asyncExit))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.asyncEntry.opId))
        msg.should.match(/Layer\W*inner \(callback\)/)
        msg.should.match(/Label\W*entry/)
      },
      // Inner exit (async)
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.asyncExit.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.exit))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.asyncExit.opId))
        msg.should.match(/Layer\W*inner/)
        msg.should.match(/Label\W*exit/)
        emitter.removeAllListeners('message')
        done()
      }
    ]

    emitter.on('message', function (msg) {
      console.log(msg.toString())
      checks.shift()(msg.toString())
    })

    outer = new Layer('outer', null, outerData)
    outer.run(function () {
      inner = Layer.last.descend('inner', innerData)
      inner.run(function (wrap) {
        var done = wrap(function (err, res) {
          should.not.exist(err)
          should.exist(res)
          res.should.equal('foo')
        })

        setImmediate(function () {
          done(null, 'foo')
        })
      })
    })
  })
})
