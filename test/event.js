var oboe = require('../lib/addon')

describe('event', function () {
  it('should report metadata string', function () {
    var event = new oboe.OboeEvent
    console.log(event.metadataString())
  })
})
