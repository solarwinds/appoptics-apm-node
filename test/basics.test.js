/* global it, describe */
'use strict'

// note: expect() triggers a lint no-unused-expressions. no apparent reason
/* eslint-disable no-unused-expressions */

const ao = require('..')
const Span = ao.Span
const expect = require('chai').expect

const helper = require('./helper')
const makeSettings = helper.makeSettings

let ifaob // execute or skip test depending on whether bindings are loaded.
let MAX_SAMPLE_RATE

if (ao.addon) {
  ifaob = it
  MAX_SAMPLE_RATE = ao.addon.MAX_SAMPLE_RATE
} else {
  ifaob = it.skip
  MAX_SAMPLE_RATE = 1000000
}

describe('basics', function () {
  it('should set trace mode as string or integer and always get a string', function () {
    ao.traceMode = 'never'
    expect(ao.traceMode).equal('disabled')

    ao.traceMode = 'always'
    expect(ao.traceMode).equal('enabled')

    ao.traceMode = 0
    expect(ao.traceMode).equal('disabled')

    ao.traceMode = 1
    expect(ao.traceMode).equal('enabled')

    ao.traceMode = 'disabled'
    expect(ao.traceMode).equal('disabled')

    ao.traceMode = 'enabled'
    expect(ao.traceMode).equal('enabled')
  })

  ifaob('should set and get sample rate', function () {
    ao.sampleRate = 0
    expect(ao.sampleRate).equal(0, 'when setting to 0')
    ao.sampleRate = 1000000
    expect(ao.sampleRate).equal(1000000, 'when setting to 1000000')
    ao.sampleRate = 100
    expect(ao.sampleRate).equal(100, 'when setting to 100')
  })

  // TODO: check helper.checkLogMessages and why substitution happens at .github but not locally
  ifaob.skip('should handle invalid sample rates correctly', function () {
    const logChecks = [
      { level: 'warn', message: 'Invalid sample rate: %s, not changed', values: [NaN] },
      { level: 'warn', message: 'Sample rate (%s) out of range, using %s', values: [2000000, 1000000] },
      { level: 'warn', message: 'Sample rate (%s) out of range, using %s', values: [-10, 0] }
    ]
    helper.checkLogMessages(logChecks)

    ao.sampleRate = NaN
    expect(ao.sampleRate).equal(100, '(unchanged) when trying to set to NaN')
    ao.sampleRate = 2000000
    expect(ao.sampleRate).equal(1000000, 'when trying to set to 2000000')
    ao.sampleRate = -10
    expect(ao.sampleRate).equal(0, 'when trying to set to a negative number')
    ao.sampleRate = 100
    expect(ao.sampleRate).equal(100, 'setting back to the original')
  })

  it('should set sample source', function () {
    ao.sampleSource = 100
  })

  it('should get sample source', function () {
    expect(ao.sampleSource).equal(100)
  })

  ifaob('should be able to check an Event\'s sample flag', function () {
    const md0 = new ao.addon.Event.makeRandom() // eslint-disable-line new-cap
    const md1 = new ao.addon.Event.makeRandom(1) // eslint-disable-line new-cap

    expect(ao.sampling(md0)).equal(false)
    expect(ao.sampling(md0.toString())).equal(false)
    expect(ao.sampling(md1)).equal(true)
    expect(ao.sampling(md1.toString())).equal(true)
  })

  ifaob('should be able to detect if it is in a trace', function () {
    expect(ao.tracing).to.be.false
    const span = Span.makeEntrySpan('test', makeSettings())

    span.run(function () {
      expect(ao.tracing).equal(true)
    })
  })

  it('should support sampling using getTraceSettings()', function () {
    const skipSample = ao.skipSample
    ao.skipSample = false
    ao.traceMode = 'always'
    ao.sampleRate = MAX_SAMPLE_RATE
    let s = ao.getTraceSettings()
    expect(s).to.not.be.false

    ao.sampleRate = 1
    const samples = []
    for (let i = 0; i < 1000; i++) {
      s = ao.getTraceSettings()
      samples.push(s.doSample)
    }
    samples.should.containEql(false)
    ao.skipSample = skipSample
  })

  ifaob('should not call sampleRate setter from sample function', function () {
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    const skipSample = ao.skipSample
    ao.skipSample = false

    function after (err) {
      expect(err).equal(undefined)
      ao.addon.Context.setDefaultSampleRate = old
      ao.skipSample = skipSample
    }

    const old = ao.addon.Context.setDefaultSampleRate
    ao.addon.Context.setDefaultSampleRate = function () {
      after()
      throw new Error('Should not have called sampleRate setter')
    }

    ao.getTraceSettings()
    after()
  })

  it('should not re-execute appoptics even if deleted from the require.cache', function () {
    const logChecks = [
      { level: 'warn', message: 'solarwinds-apm is being executed more than once' }
    ]
    helper.checkLogMessages(logChecks)
    const key = require.resolve('..')
    delete require.cache[key]
    const ao2 = require('..')
    expect(ao).equal(ao2)
  })
})
