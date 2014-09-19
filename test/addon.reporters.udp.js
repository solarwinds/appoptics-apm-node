var helper = require('./helper')
var oboe = require('..').addon

describe('addon.reporters.udp', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
  })
  after(function (done) {
    emitter.close(done)
  })

  it('should construct', function () {
    new oboe.UdpReporter('127.0.0.1')
  })

  it('should report event', function (done) {
    var event = oboe.Context.createEvent()

    // Receive the message from the udp server and verify the id matches
    emitter.on('message', function (msg) {
      msg.should.have.property('X-Trace', event.toString())
      done()
    })

    emitter.reporter.sendReport(event)
  })
})
