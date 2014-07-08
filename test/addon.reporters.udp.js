var oboe = require('..').addon
var Emitter = require('events').EventEmitter
var dgram = require('dgram')

describe('addon.reporters.udp', function () {
  var server = dgram.createSocket('udp4')
  var emitter = new Emitter
  var reporter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter.on('error', server.close.bind(server))

    server.on('message', emitter.emit.bind(emitter, 'message'))
    server.on('error', emitter.emit.bind(emitter, 'error'))
    server.on('listening', done)

    server.bind(4567)
  })

  after(function (done) {
    server.on('close', done)
    server.close()
  })

  it('should construct', function () {
    reporter = new oboe.UdpReporter('127.0.0.1', 4567)
  })

  it('should report event', function (done) {
    var event = oboe.Context.createEvent()

    // Receive the message from the udp server and verify the id matches
    emitter.on('message', function (msg) {
      msg.toString().should.match(new RegExp(event.toString(), 'i'))
      done()
    })

    reporter.sendReport(event)
  })
})
