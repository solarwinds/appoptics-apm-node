var should = require('should')
var oboe = require('..')
var Layer = oboe.Layer

describe('basics', function () {
  it('should get trace mode', function () {
    oboe.traceMode.should.equal(oboe.addon.TRACE_THROUGH)
  })

  it('should set trace mode', function () {
    oboe.traceMode = oboe.addon.TRACE_ALWAYS
    oboe.traceMode.should.equal(oboe.addon.TRACE_ALWAYS)
  })

  it('should set trace mode as string', function () {
    oboe.traceMode = 'never'
    oboe.traceMode.should.equal(oboe.addon.TRACE_NEVER)

    oboe.traceMode = 'always'
    oboe.traceMode.should.equal(oboe.addon.TRACE_ALWAYS)

    oboe.traceMode = 'through'
    oboe.traceMode.should.equal(oboe.addon.TRACE_THROUGH)
  })

  it('should set and get sample rate', function () {
    oboe.sampleRate = 100
    oboe.sampleRate.should.equal(100)
  })

  it('should get sample source', function () {
    should.not.exist(oboe.sampleSource)
  })

  it('should set sample source', function () {
    oboe.sampleSource = 100
    oboe.sampleSource.should.equal(100)
  })

  it('should have sugary trace mode detectors', function () {
    // Reset first
    oboe.traceMode = oboe.addon.TRACE_THROUGH

    oboe.always.should.be.false
    oboe.traceMode = oboe.addon.TRACE_ALWAYS
    oboe.always.should.be.true

    oboe.never.should.be.false
    oboe.traceMode = oboe.addon.TRACE_NEVER
    oboe.never.should.be.true

    oboe.through.should.be.false
    oboe.traceMode = oboe.addon.TRACE_THROUGH
    oboe.through.should.be.true
  })

  it('should be able to detect if it is in a trace', function () {
    oboe.tracing.should.be.false
    var layer = new Layer('test')
    layer.run(function () {
      oboe.tracing.should.be.true
    })
  })

  it('should support sampling', function () {
    oboe.traceMode = 'always'
    oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE
    var s = oboe.sample('test')
    s.should.not.be.false

    oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE / 2
    var samples = []
    for (var i = 0; i < 100; i++) {
      s = oboe.sample(Math.random().toString())
      samples.push(!!s[0])
    }
    samples.should.containEql(false)
    samples.should.containEql(true)
  })
})
