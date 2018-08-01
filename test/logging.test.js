'use strict'

const should = require('should') // eslint-disable-line no-unused-vars
const ao = require('..')
const debug = ao.loggers._debug
//const Span = ao.Span

//
// for some reason it's  not possible to set debug.inspectOpts.colors
// here and have it take effect. At this point mocha has already loaded
// multiple packages that use debug. rather than continue figuring out
// debug it's easier just to use regex to skip over the color manipulation.
//
function getLevelAndText (text) {
  // eslint-disable-next-line no-control-regex
  const match = text.match(/\s*\u001b\[[0-9;]+m(.+) \u001b\[0m(.+)/)
  if (match) {
    return [match[1], match[2]]
  }
  return ['', '']
}


describe('logging', function () {
  const levels = ao.logLevel
  const logger = debug.log

  before(function () {
    ao.logLevel = 'error,warn'
  })

  after(function () {
    ao.logLevel = levels
  })

  afterEach(function () {
    debug.log = logger
  })

  it('should set logging', function () {
    let correct = false
    const real = debug.enable
    debug.enable = function (level) {
      correct = level === 'appoptics:span'
      debug.enable = real
    }
    const before = ao.logLevel
    ao.logLevel = 'span'
    ao.logLevel.should.equal('span')
    correct.should.equal(true)
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

  it('should log correctly', function () {
    const msg = 'test logging'
    let called = false
    debug.log = function (output) {
      const [level, text] = getLevelAndText(output)
      level.should.equal('appoptics:error')
      text.should.equal(msg)
      called = true
    }
    ao.loggers.error(msg)
    called.should.equal(true, 'logger must be called')
  })

  it('should debounce repetitive logging by count', function () {
    const msg = 'test logging'
    const aolevel = 'error'
    let debounced = new ao.loggers.Debounce('error')
    let count = 0
    let i
    debug.log = function (output) {
      const [level, text] = getLevelAndText(output)
      level.should.equal('appoptics:' + aolevel)
      text.should.equal('[' + (i + 1) + ']' + msg)
      count += 1
    }
    for (i = 0; i < 1000; i++) {
      debounced.log(msg)
    }
    count.should.equal(11)

    debounced = new ao.loggers.Debounce('error', {deltaCount: 500})
    count = 0
    for (i = 0; i < 1000; i++) {
      debounced.log(msg)
    }
    count.should.equal(3)
  })

  it('should debounce repetitive logging by time', function (done) {
    const msg = 'test logging'
    const aolevel = 'error'
    const options = {
      deltaCount: Infinity,        // don't ever log due to count
      deltaTime: 1000              // log at most one time per second
    }
    const debounced = new ao.loggers.Debounce('error', options)
    let count = 0
    let calls = 0

    debug.log = function (output) {
      const [level, text] = getLevelAndText(output)
      level.should.equal('appoptics:' + aolevel)
      text.should.equal('[' + calls + ']' + msg)
      count += 1
    }

    let i = 0

    const id = setInterval(function () {
      calls += 1
      debounced.log(msg)
      i += 1
      if (i >= 4) {
        clearInterval(id)
        clearInterval(lid)
        count.should.equal(4)
        done()
      }
    }, 1000)

    // log every 10 ms
    const lid = setInterval(function () {
      calls += 1
      debounced.log(msg)
    }, 10)

  })

  // TODO BAM keeping these around to add tests of various custom formatters at
  // some point in the future. E.g., %e, %l.
  /*
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
  // */
})
