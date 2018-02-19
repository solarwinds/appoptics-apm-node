var helper = require('./helper')
var should = require('should')
var debug = require('debug')
var http = require('http')
var ao = require('..')
var Layer = ao.Layer

describe('basics', function () {
  it('should set trace mode', function () {
    ao.sampleMode = ao.addon.TRACE_ALWAYS
  })

  it('should get trace mode', function () {
    ao.sampleMode.should.equal(ao.addon.TRACE_ALWAYS)
  })

  it('should set trace mode as string', function () {
    ao.sampleMode = 'never'
    ao.sampleMode.should.equal(ao.addon.TRACE_NEVER)

    ao.sampleMode = 'always'
    ao.sampleMode.should.equal(ao.addon.TRACE_ALWAYS)
  })

  it('should set and get sample rate', function () {
    ao.sampleRate = 100
    ao.sampleRate.should.equal(100)
  })

  it('should set sample source', function () {
    ao.sampleSource = 100
  })

  it('should get sample source', function () {
    ao.sampleSource.should.equal(100)
  })

  it('should have sugary trace mode detectors', function () {
    // Reset first
    ao.sampleMode = ao.addon.TRACE_NEVER

    ao.always.should.be.false
    ao.sampleMode = ao.addon.TRACE_ALWAYS
    ao.always.should.be.true

    ao.never.should.be.false
    ao.sampleMode = ao.addon.TRACE_NEVER
    ao.never.should.be.true
  })

  it('should get access key', function () {
    ao.accessKey.should.be.a.String
  })

  it('should set logging', function () {
    var called = false
    var real = debug.enable
    debug.enable = function () {
      called = true
      debug.enable = real
    }
    var before = ao.logLevel
    ao.logLevel = 'layer'
    ao.logLevel.should.equal('layer')
    called.should.equal(true)
    ao.logLevel = before
  })

  it('should be able to detect if it is in a trace', function () {
    ao.tracing.should.be.false
    var layer = new Layer('test')
    layer.run(function () {
      ao.tracing.should.be.true
    })
  })

  it('should support sampling', function () {
    var skipSample = ao.skipSample
    ao.skipSample = false
    ao.sampleMode = 'always'
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    var s = ao.sample('test')
    s.should.not.be.false

    ao.sampleRate = 1
    var samples = []
    for (var i = 0; i < 1000; i++) {
      s = ao.sample('test')
      samples.push(!!s[0])
    }
    samples.should.containEql(false)
    ao.skipSample = skipSample
  })

  it('should not call sampleRate setter from sample function', function () {
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    var skipSample = ao.skipSample
    ao.skipSample = false

    function after (err) {
      ao.addon.Context.setDefaultSampleRate = old
      ao.skipSample = skipSample
    }

    var old = ao.addon.Context.setDefaultSampleRate
    ao.addon.Context.setDefaultSampleRate = function () {
      after()
      throw new Error('Should not have called sampleRate setter')
    }

    ao.sample('test')
    after()
  })

  // TODO consider removing this old test for "through" mode
  it('should not trace when mode "never"', function (done) {
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'never'

    var sendReport = ao.reporter.sendReport
    ao.reporter.sendReport = function (event) {
      ao.reporter.sendReport = sendReport
      done(new Error('Tried to send an event'))
    }

    var server = http.createServer(function (req, res) {
      res.end('hi')
    })

    server.listen(function () {
      var port = server.address().port
      http.get('http://localhost:' + port, function (res) {
        res.on('end', function () {
          ao.reporter.sendReport = sendReport
          done()
        })
        res.resume()
      })
    })
  })
})
