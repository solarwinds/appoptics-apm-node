var oboe = require('../lib/addon')

describe('metadata', function () {
  var metadata
  var string

  it('should construct', function () {
    metadata = new oboe.Metadata()
  })

  it('should serialize to string', function () {
    string = metadata.toString()
    string.should.equal('')
  })

  it.skip('should construct from string', function () {
    oboe.Metadata.fromString(string).toString().should.equal(string)
  })

  it.skip('should construct from random data', function () {
    oboe.Metadata.makeRandom().toString().should.not.equal('')
  })

  it.skip('should clone itself', function () {
    var rand = oboe.Metadata.makeRandom()
    rand.copy().toString().should.equal(rand.toString())
  })

  it('should be valid', function () {
    metadata.isValid().should.equal(true)
  })

  it.skip('should create an event', function () {
    var event = metadata.createEvent()
    event.should.be.an.instanceof(oboe.Event)
  })
})
