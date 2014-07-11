var Emitter = require('events').EventEmitter
var dgram = require('dgram')
var oboe = require('..')
var addon = oboe.addon

exports.tracelyzer = function (port, done) {
  var server = dgram.createSocket('udp4')
  var emitter = new Emitter

  emitter.on('error', server.close.bind(server))

  server.on('message', emitter.emit.bind(emitter, 'message'))
  server.on('error', emitter.emit.bind(emitter, 'error'))
  server.on('listening', done)

  server.bind(1234)

  // Connect to test server
  var reporter = new addon.UdpReporter('127.0.0.1', 1234)
  emitter.reporter = reporter
  oboe.reporter = reporter

  // Attach close function to use in after()
  emitter.close = function (done) {
    server.on('close', done)
    server.close()
  }

  return emitter
}
