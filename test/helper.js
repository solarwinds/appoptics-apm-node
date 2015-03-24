var tv = exports.tv = require('..')
tv.skipSample = true

var debug = require('debug')('traceview:test:helper')
var log = require('debug')('traceview:test:helper:tracelyzer-message')
var Emitter = require('events').EventEmitter
var BSON = require('bson').BSONPure.BSON
var extend = require('util')._extend
var request = require('request')
var dgram = require('dgram')
var https = require('https')
var http = require('http')

exports.tracelyzer = function (done) {
  // Create UDP server to mock tracelyzer
  var server = dgram.createSocket('udp4')

  // Create emitter to forward messages
  var emitter = new Emitter

  // Forward events
  server.on('error', emitter.emit.bind(emitter, 'error'))
  server.on('message', function (msg) {
    var port = server.address().port
    var parsed = BSON.deserialize(msg)
    log('mock tracelyzer (port ' + port + ') received', parsed)
    emitter.emit('message', parsed)
  })

  // Wait for the server to become available
  server.on('listening', function () {
    var port = server.address().port
    tv.port = port.toString()
    emitter.port = port
    debug('mock tracelyzer (port ' + port + ') listening')
    process.nextTick(done)
  })

  // Start mock tracelyzer
  server.bind()

  // Expose some things through the emitter
  emitter.server = server

  // Attach close function to use in after()
  emitter.close = function (done) {
    var port = server.address().port
    server.on('close', function () {
      debug('mock tracelyzer (port ' + port + ') closed')
      process.nextTick(done)
    })
    server.close()
  }

  return emitter
}

exports.doChecks = function (emitter, checks, done) {
  var first = true
  var edge

  var add = emitter.server.address()

  emitter.removeAllListeners('message')

  function onMessage (msg) {
    log('mock tracelyzer (port ' + add.port + ') received message', msg)
    var check = checks.shift()
    if (check) {
      check(msg)
    }

    // Always verify that a valid X-Trace ID is present
    msg.should.have.property('X-Trace').and.match(/^1B[0-9A-F]{56}$/)

    // After the first event, verify valid edges are present
    if (first) {
      first = false
    } else {
      msg.should.have.property('Edge').and.match(/^[0-9A-F]{16}$/)
    }

    debug(checks.length + ' checks left')
    if ( ! checks.length) {
      // NOTE: This is only needed because some
      // tests have less checks than messages
      emitter.removeListener('message', onMessage)
      done()
    }
  }

  emitter.on('message', onMessage)
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
    debug('test started')
    test(function (err, data) {
      debug('test ended')
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
    http.get('http://localhost:' + port).on('error', done)
  })
}

exports.httpsTest = function (emitter, options, test, validations, done) {
  var server = https.createServer(options, function (req, res) {
    debug('test started')
    test(function (err, data) {
      debug('test ended')
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
    https.get('https://localhost:' + port).on('error', done)
  })
}

exports.run = function (context, path) {
  context.data = context.data || {}
  var mod = require('./probes/' + path)

  if (mod.data) {
    var data = mod.data
    if (typeof data === 'function') {
      data = data(context)
    }
    extend(context.data, data)
  }

  context.tv = tv

  return function (done) {
    return mod.run(context, done)
  }
}

var pad = 250
var last = Date.now()
exports.padTime = function (done) {
  var now = Date.now()
  var diff = now - last
  last = now

  var t = Math.max(pad - diff, 1)
  setTimeout(done, t)
}
