var oboe = require('../..').addon

describe('addon.event', function () {
  var event

  it('should construct', function () {
    event = new oboe.Event()
  })

  it('should add info', function () {
    event.addInfo('key', 'val')
  })

  it('should add edge', function () {
    var e = new oboe.Event()
    var meta = e.getMetadata()
    event.addEdge(meta)
  })

  it('should add edge as string', function () {
    var e = new oboe.Event()
    var meta = e.toString()
    event.addEdge(meta.toString())
  })

  it('should get metadata', function () {
    var meta = event.getMetadata()
    meta.should.be.an.instanceof(oboe.Metadata)
  })

  it('should serialize metadata to id string', function () {
    var meta = event.toString()
    meta.should.be.an.instanceof(String).with.lengthOf(58)
    meta[0].should.equal('1')
    meta[1].should.equal('B')
  })

  it('should start tracing, returning a new instance', function () {
    var meta = new oboe.Metadata()
    var event2 = oboe.Event.startTrace(meta)
  })
})
