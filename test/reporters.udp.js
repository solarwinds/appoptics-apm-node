var oboe = require('../lib/addon')

describe('reporters/udp', function () {
  var reporter

  it('should construct', function () {
    reporter = new oboe.UdpReporter('127.0.0.1')
  })

  it('should report event', function () {
    reporter.sendReport(new oboe.Event())
  })
})
