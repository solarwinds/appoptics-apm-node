var oboe = require('../..').addon

describe('addon.metadata', function () {
  var metadata
  var string

  it('should construct', function () {
    metadata = new oboe.Metadata()
  })

  it('should construct from random data', function () {
    metadata = oboe.Metadata.makeRandom()
    metadata.toString().should.not.equal('')
  })

  it('should serialize to string', function () {
    string = metadata.toString()
    string.should.not.equal('')
  })

  it('should construct from string', function () {
    metadata = oboe.Metadata.fromString(string)
    metadata.toString().should.equal(string)
  })

  it('should clone itself', function () {
    var rand = oboe.Metadata.makeRandom()
    rand.copy().toString().should.equal(rand.toString())
  })

  it('should be valid', function () {
    metadata.isValid().should.equal(true)
  })

  it('should create an event', function () {
    var event = metadata.createEvent()
    event.should.be.an.instanceof(oboe.Event)
  })
})
