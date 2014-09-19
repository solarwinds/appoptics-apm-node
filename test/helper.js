var debug = require('debug')('traceview:test:helper')
var log = require('debug')('traceview:test:helper:tracelyzer-message')
var Emitter = require('events').EventEmitter
var BSON = require('bson').BSONPure.BSON
var extend = require('util')._extend
var request = require('request')
var dgram = require('dgram')
var https = require('https')
var http = require('http')
var tv = require('..')
var addon = tv.addon

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
  server.on('error', emitter.emit.bind(emitter, 'error'))
  server.on('message', function (msg) {
    emitter.emit('message', BSON.deserialize(msg))
  })

  // Wait for the server to become available
  server.on('listening', function () {
    debug('mock tracelyzer (port ' + port + ') listening')
    process.nextTick(done)
  })

  // Start mock tracelyzer
  server.bind(port)

  // Create and use reporter pointing to mock tracelyzer
  tv.reporter = new addon.UdpReporter('127.0.0.1', port)

  // Expose some things through the emitter
  emitter.reporter = tv.reporter
  emitter.server = server
  emitter.port = port

  // Attach close function to use in after()
  emitter.close = function (done) {
    server.on('close', function () {
      debug('mock tracelyzer (port ' + port + ') closed')
      process.nextTick(done)
    })
    server.close()
  }

  return emitter
}

exports.doChecks = function (emitter, checks, done) {
  emitter.on('message', function (msg) {
    var check = checks.shift()
    if (check) {
      check(msg)
    }

    if ( ! checks.length) {
      emitter.removeAllListeners('message')
      done()
    }
  })
}

var check = {
  'http-entry': function (msg) {
    msg.should.have.property('Layer', 'nodejs')
    msg.should.have.property('Label', 'entry')
    debug('entry is valid')
  },
  'http-exit': function (msg) {
    msg.should.have.property('Layer', 'nodejs')
    msg.should.have.property('Label', 'exit')
    debug('exit is valid')
  }
}

exports.httpTest = function (emitter, test, validations, done) {
  var server = http.createServer(function (req, res) {
    debug('request started')
    test(function (err, data) {
      if (err) return done(err)
      res.end('done')
    })
  })

  validations.unshift(check['http-entry'])
  validations.push(check['http-exit'])
  exports.doChecks(emitter, validations, function () {
    server.close(done)
  })

  server.listen(function () {
    var port = server.address().port
    debug('test server listening on port ' + port)
    request('http://localhost:' + port)
  })
}

exports.httpsTest = function (emitter, options, test, validations, done) {
  var server = https.createServer(options, function (req, res) {
    debug('request started')
    test(function (err, data) {
      if (err) return done(err)
      res.end('done')
    })
  })

  validations.unshift(check['http-entry'])
  validations.push(check['http-exit'])
  exports.doChecks(emitter, validations, function () {
    server.close(done)
  })

  server.listen(function () {
    var port = server.address().port
    debug('test server listening on port ' + port)
    request('https://localhost:' + port)
  })
}

exports.run = function (context, path) {
  context.data = context.data || {}
  var mod = require('./' + path)

  if (mod.data) {
    var data = mod.data
    if (typeof data === 'function') {
      data = data(context)
    }
    extend(context.data, data)
  }

  return function (done) {
    return mod.run(context, done)
  }
}
