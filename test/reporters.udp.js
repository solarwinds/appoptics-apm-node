var oboe = require('../lib/addon')
var Emitter = require('events').EventEmitter
var dgram = require('dgram')

describe('reporters/udp', function () {
  var emitter = new Emitter
  var reporter
  var remote
  var after

  var server = dgram.createSocket('udp4')

  before(function (done) {
    emitter.on('error', server.close.bind(server))

    server.on('message', emitter.emit.bind(emitter, 'message'))
    server.on('error', emitter.emit.bind(emitter, 'error'))
    server.on('listening', done)

    server.bind(7831)
  })

  it('should construct', function () {
    reporter = new oboe.UdpReporter('127.0.0.1')
  })

  it('should report event', function (done) {
    var event = new oboe.Event()

    // Receive the message from the udp server and verify the id matches
    emitter.on('message', function (msg) {
      msg.toString().should.match(new RegExp(event.metadataString(), 'i'))
      done()
    })

    reporter.sendReport(event)
  })
})
