var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon
var Layer = oboe.Layer

describe('layer', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE
    oboe.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  function doChecks (checks, done) {
    emitter.on('message', function (msg) {
      var check = checks.shift()
      if (check) {
        check(msg.toString())
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
        msg.should.match(new RegExp('X-Trace\\W*' + e.entry, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name, 'i'))
        msg.should.match(/Label[^\s]*entry/)

        Object.keys(data).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + data[key], 'i'))
        })
      },
      // Verify structure of exit event
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + e.entry.taskId, 'i'))
        msg.should.match(new RegExp('X-Trace\\W*' + e.exit, 'i'))
        msg.should.match(new RegExp('Edge\\W*' + e.entry.opId, 'i'))
        msg.should.match(new RegExp('Layer\\W*' + name, 'i'))
        msg.should.match(/Label[^\s]*exit/)
      }
    ]

    doChecks(checks, done)

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
        msg.should.match(new RegExp('Edge\\W*' + outer.events.entry.opId))
        msg.should.match(/Layer\W*outer/)
        msg.should.match(/Label\W*exit/)
      },
      // Inner exit (async)
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.exit.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.exit))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.entry.opId))
        msg.should.match(/Layer\W*inner/)
        msg.should.match(/Label\W*exit/)
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

        setImmediate(function () {
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
        msg.should.match(new RegExp('X-Trace\\W*' + outer.events.entry))
        msg.should.match(/Layer\W*outer/)
        msg.should.match(/Label\W*entry/)

        Object.keys(outerData).forEach(function (key) {
          msg.should.match(new RegExp(key + '\\W*' + outerData[key]))
        })
      },
      // Outer exit (async)
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + outer.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + outer.events.exit))
        msg.should.match(new RegExp('Edge\\W*' + outer.events.entry.opId))
        msg.should.match(/Layer\W*outer/)
        msg.should.match(/Label\W*exit/)
      },
      // Inner entry
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
      // Inner exit
      function (msg) {
        msg.should.match(new RegExp('X-Trace\\W*1B' + inner.events.entry.taskId))
        msg.should.match(new RegExp('X-Trace\\W*' + inner.events.exit))
        msg.should.match(new RegExp('Edge\\W*' + inner.events.entry.opId))
        msg.should.match(/Layer\W*inner/)
        msg.should.match(/Label\W*exit/)
      },
    ]

    emitter.on('message', function (msg) {
      console.log(msg.toString())
    })
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

      setImmediate(function () {
        delayed(null, 'foo')
      })
    })
  })
})
