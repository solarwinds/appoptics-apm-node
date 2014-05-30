var oboe = require('../lib/addon')

describe('context', function () {
  it('should initialize', function () {
    oboe.Context.init()
  })

  it('should set tracing mode to never', function () {
    oboe.Context.setTracingMode(0)
  })
  it('should set tracing mode to always', function () {
    oboe.Context.setTracingMode(1)
  })
  it('should set tracing mode to through', function () {
    oboe.Context.setTracingMode(2)
  })

  it.skip('should set tracing mode to an invalid input', function () {
    try {
      oboe.Context.setTracingMode(3)
    } catch (e) {
      return
    }

    throw new Error('setTracingMode should fail on invalid inputs')
  })

  it('should set default sample rate', function () {
    oboe.Context.setDefaultSampleRate(100000)
  })

  it('should check if a request should be sampled', function () {
    oboe.Context.setDefaultSampleRate(1000000)
    var check = oboe.Context.sampleRequest('a', 'b', 'c')
  })

  it('should serialize context to string', function () {
    var string = oboe.Context.toString()
    string.should.equal('1B00000000000000000000000000000000000000000000000000000000')
  })

  it('should set context to metadata instance', function () {
    var metadata = new oboe.Metadata()
    oboe.Context.set(metadata)
    oboe.Context.toString().should.equal(metadata.toString())
  })

  it('should set context from metadata string', function () {
    var string = (new oboe.Metadata()).toString()
    oboe.Context.fromString(string)
    oboe.Context.toString().should.equal(string)
  })

  it('should copy context to metadata instance', function () {
    var metadata = oboe.Context.copy()
    oboe.Context.toString().should.equal(metadata.toString())
  })

  it('should clear the context', function () {
    var string = '1B00000000000000000000000000000000000000000000000000000000'
    oboe.Context.toString().should.not.equal(string)
    oboe.Context.clear()
    oboe.Context.toString().should.equal(string)
  })

  it('should be valid', function () {
    oboe.Context.isValid().should.equal(false)
  })

  it('should create an event from the current context', function () {
    var event = oboe.Context.createEvent()
    event.should.be.an.instanceof(oboe.Event)
  })

  it('should start a trace from the current context', function () {
    var event = oboe.Context.startTrace()
    event.should.be.an.instanceof(oboe.Event)
  })
})
