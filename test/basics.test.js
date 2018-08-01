'use strict'

const should = require('should') // eslint-disable-line no-unused-vars
const debug = require('debug')
const ao = require('..')
const Span = ao.Span

let ifaob    // execute or skip test depending on whether bindings are loaded.
let ALWAYS
let NEVER
let MAX_SAMPLE_RATE

if (ao.addon) {
  ifaob = it
  ALWAYS = ao.addon.TRACE_ALWAYS
  NEVER = ao.addon.TRACE_NEVER
  MAX_SAMPLE_RATE = ao.addon.MAX_SAMPLE_RATE
} else {
  ifaob = it.skip
  ALWAYS = 1
  NEVER = 0
  MAX_SAMPLE_RATE = 1000000
}


describe('basics', function () {
  it('should set trace mode', function () {
    ao.sampleMode = ALWAYS
  })

  it('should get trace mode', function () {
    ao.sampleMode.should.equal(ALWAYS)
  })

  it('should set trace mode as string', function () {
    ao.sampleMode = 'never'
    ao.sampleMode.should.equal(NEVER)

    ao.sampleMode = 'always'
    ao.sampleMode.should.equal(ALWAYS)
  })

  ifaob('should set and get sample rate', function () {
    ao.sampleRate = 0
    ao.sampleRate.should.equal(0, 'when setting to 0')
    ao.sampleRate = 1000000
    ao.sampleRate.should.equal(1000000, 'when setting to 1000000')
    ao.sampleRate = 100
    ao.sampleRate.should.equal(100, 'when setting to 100')
  })

  ifaob('should handle invalid sample rates correctly', function () {
    ao.sampleRate = NaN
    ao.sampleRate.should.equal(100, 'when trying to set to NaN')
    ao.sampleRate = 2000000
    ao.sampleRate.should.equal(1000000, 'when trying to set to 2000000')
    ao.sampleRate = -10
    ao.sampleRate.should.equal(0, 'when trying to set to a negative number')
    ao.sampleRate = 100
    ao.sampleRate.should.equal(100, 'setting back to the original')
  })

  it('should set sample source', function () {
    ao.sampleSource = 100
  })

  it('should get sample source', function () {
    ao.sampleSource.should.equal(100)
  })

  it('should have sugary trace mode detectors', function () {
    // Reset first
    ao.sampleMode = NEVER

    ao.always.should.be.false
    ao.sampleMode = ALWAYS
    ao.always.should.be.true

    ao.never.should.be.false
    ao.sampleMode = NEVER
    ao.never.should.be.true
  })

  ifaob('should get the service key', function () {
    ao.serviceKey.should.be.a.String
  })

  it('should set logging', function () {
    let called = false
    const real = debug.enable
    debug.enable = function () {
      called = true
      debug.enable = real
    }
    const before = ao.logLevel
    ao.logLevel = 'span'
    ao.logLevel.should.equal('span')
    called.should.equal(true)
    ao.logLevel = before
  })

  it('should add and remove logging', function () {
    const add = 'info,span'
    const previous = ao.logLevel
    const expected = previous ? previous + ',' + add : add
    ao.logLevelAdd(add)
    ao.logLevel.should.equal(expected)
    ao.logLevelRemove(add)
    ao.logLevel.should.equal(previous)
  })

  ifaob('should be able to check metadata\'s sample flag', function () {
    const md0 = new ao.addon.Metadata.makeRandom()
    const md1 = new ao.addon.Metadata.makeRandom(1)

    ao.sampling(md0).should.equal(false)
    ao.sampling(md0.toString()).should.equal(false)
    ao.sampling(md1).should.equal(true)
    ao.sampling(md1.toString()).should.equal(true)
  })

  ifaob('should be able to detect if it is in a trace', function () {
    ao.tracing.should.be.false
    const span = new Span('test')
    span.run(function () {
      ao.tracing.should.be.true
    })
  })

  it('should support sampling', function () {
    const skipSample = ao.skipSample
    ao.skipSample = false
    ao.sampleMode = 'always'
    ao.sampleRate = MAX_SAMPLE_RATE
    let s = ao.sample('test')
    s.should.not.be.false

    ao.sampleRate = 1
    const samples = []
    for (let i = 0; i < 1000; i++) {
      s = ao.sample('test')
      samples.push(!!s[0])
    }
    samples.should.containEql(false)
    ao.skipSample = skipSample
  })

  ifaob('should not call sampleRate setter from sample function', function () {
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    const skipSample = ao.skipSample
    ao.skipSample = false

    function after (err) {
      should.equal(err, undefined)
      ao.addon.Context.setDefaultSampleRate = old
      ao.skipSample = skipSample
    }

    const old = ao.addon.Context.setDefaultSampleRate
    ao.addon.Context.setDefaultSampleRate = function () {
      after()
      throw new Error('Should not have called sampleRate setter')
    }

    ao.sample('test')
    after()
  })
})
