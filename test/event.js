var oboe = require('../lib/addon')

describe('event', function () {
  it('should serialize metadata to id string', function () {
    var event = new oboe.Event
    var meta = event.metadataString()
    meta.should.be.an.instanceof(String).with.lengthOf(58)
    meta[0].should.equal('1')
    meta[1].should.equal('B')
  })
})

describe('reporters/udp', function () {
  var reporter

  it('should construct', function () {
    reporter = new oboe.UdpReporter('127.0.0.1')
  })

  it('should report event', function () {
    reporter.sendReport(new oboe.Event)
  })
})
