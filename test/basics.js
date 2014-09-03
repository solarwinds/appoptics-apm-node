var should = require('should')
var tv = require('..')
var Layer = tv.Layer

describe('basics', function () {
  it('should get trace mode', function () {
    tv.traceMode.should.equal(tv.addon.TRACE_THROUGH)
  })

  it('should set trace mode', function () {
    tv.traceMode = tv.addon.TRACE_ALWAYS
    tv.traceMode.should.equal(tv.addon.TRACE_ALWAYS)
  })

  it('should set trace mode as string', function () {
    tv.traceMode = 'never'
    tv.traceMode.should.equal(tv.addon.TRACE_NEVER)

    tv.traceMode = 'always'
    tv.traceMode.should.equal(tv.addon.TRACE_ALWAYS)

    tv.traceMode = 'through'
    tv.traceMode.should.equal(tv.addon.TRACE_THROUGH)
  })

  it('should set and get sample rate', function () {
    tv.sampleRate = 100
    tv.sampleRate.should.equal(100)
  })

  it('should get sample source', function () {
    should.not.exist(tv.sampleSource)
  })

  it('should set sample source', function () {
    tv.sampleSource = 100
    tv.sampleSource.should.equal(100)
  })

  it('should have sugary trace mode detectors', function () {
    // Reset first
    tv.traceMode = tv.addon.TRACE_THROUGH

    tv.always.should.be.false
    tv.traceMode = tv.addon.TRACE_ALWAYS
    tv.always.should.be.true

    tv.never.should.be.false
    tv.traceMode = tv.addon.TRACE_NEVER
    tv.never.should.be.true

    tv.through.should.be.false
    tv.traceMode = tv.addon.TRACE_THROUGH
    tv.through.should.be.true
  })

  it('should be able to detect if it is in a trace', function () {
    tv.tracing.should.be.false
    var layer = new Layer('test')
    layer.run(function () {
      tv.tracing.should.be.true
    })
  })

  it('should support sampling', function () {
    tv.traceMode = 'always'
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    var s = tv.sample('test')
    s.should.not.be.false

    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE / 2
    var samples = []
    for (var i = 0; i < 100; i++) {
      s = tv.sample(Math.random().toString())
      samples.push(!!s[0])
    }
    samples.should.containEql(false)
    samples.should.containEql(true)
  })
})
