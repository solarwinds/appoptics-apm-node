var debug = require('debug')('mock-tracelyzer')
var log = require('debug')('mock-tracelyzer-message')
var Emitter = require('events').EventEmitter
var dgram = require('dgram')
var oboe = require('..')
var addon = oboe.addon

exports.tracelyzer = function (done) {
  // Pick a random port
  // TODO: Determine available ports on CI server
  var port = Math.floor(Math.random() * 10000) + 1000

  // Create UDP server to mock tracelyzer
  var server = dgram.createSocket('udp4')

  // Create emitter to forward messages
  var emitter = new Emitter

  // Log messages, when debugging
  server.on('message', function (msg) {
    log('mock tracelyzer (port ' + port + ') received ' + msg.toString())
  })

  // Forward events
  emitter.on('error', server.close.bind(server))
  server.on('message', emitter.emit.bind(emitter, 'message'))
  server.on('error', emitter.emit.bind(emitter, 'error'))

  // Wait for the server to become available
  server.on('listening', function () {
    debug('mock tracelyzer (port ' + port + ') listening')
    setImmediate(done)
  })

  // Start mock tracelyzer
  server.bind(port)

  // Create and use reporter pointing to mock tracelyzer
  oboe.reporter = new addon.UdpReporter('127.0.0.1', port)

  // Expose some things through the emitter
  emitter.reporter = oboe.reporter
  emitter.server = server
  emitter.port = port

  // Attach close function to use in after()
  emitter.close = function (done) {
    server.on('close', function () {
      debug('mock tracelyzer (port ' + port + ') closed')
      setImmediate(done)
    })
    server.close()
  }

  return emitter
}
