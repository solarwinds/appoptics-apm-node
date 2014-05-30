var oboe = require('../lib/addon')

describe('event', function () {
  var event

  it('should construct', function () {
    event = new oboe.Event()
  })

  it('should add info', function () {
    event.addInfo('key', 'val')
  })

  it('should add edge', function () {
    var meta = new oboe.Metadata()
    event.addEdge(meta)
  })

  it('should add edge string', function () {
    var meta = new oboe.Metadata()
    event.addEdgeStr(meta.toString())
  })

  it('should get metadata', function () {
    var meta = event.getMetadata()
  })

  it('should serialize metadata to id string', function () {
    var meta = event.metadataString()
    meta.should.be.an.instanceof(String).with.lengthOf(58)
    meta[0].should.equal('1')
    meta[1].should.equal('B')
  })

  it('should start tracing, returning a new instance', function () {
    var meta = new oboe.Metadata()
    var event2 = event.startTrace(meta)
  })
})
