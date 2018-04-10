var ao = exports.ao = require('..')
var realPort = ao.port
ao.skipSample = true

var Emitter = require('events').EventEmitter
var debug = require('debug')('appoptics:test:helper')
var extend = require('util')._extend
var bson = require('bson')
var dgram = require('dgram')
var https = require('https')
var http = require('http')
var path = require('path')

var log = ao.loggers

log.addGroup({
  groupName: 'test',
  subNames: ['info', 'mock-port', 'message']
})

// each module must implement. this only provides a
// common framework to check the environment variable.
exports.skipTest = function (filename) {
  if (!process.env.AO_SKIP_TEST) {
    return false
  }

  var skips = process.env.AO_SKIP_TEST.split(',')
  var test = path.basename(filename, '.test.js')

  if (!~skips.indexOf(test)) {
    return false
  }

  ao.loggers.warn('skipping test', test)
  return true
}

// if not specifically turning on error and warning debugging, turn it off
if (!process.env.AO_TEST_DEBUG_LOGLEVEL) {
  var logs = (process.env.DEBUG || '').split(',')
  logs = logs.filter(function (item) {return !item.startsWith('appoptics:')}).join(',')
  process.env.DEBUG = logs
  // pseudo-log-level that has no logger.
  ao.logLevel = 'none'
}

var BSON = new bson.BSONPure.BSON()

var udpPort = 7832

if (process.env.APPOPTICS_REPORTER_UDP) {
  var parts = process.env.APPOPTICS_REPORTER_UDP.split(':')
  if (parts.length == 2) udpPort = parts[1]
}

debug('helper found real port = ' + realPort)

function udpSend (msg, port, host) {
  var client = dgram.createSocket('udp4')
  client.send(msg, 0, msg.length, Number(port), host, function () {
    client.close()
  })
}

exports.appoptics = function (done) {
  // Create UDP server to mock appoptics
  var server = dgram.createSocket('udp4')

  // Create emitter to forward messages
  var emitter = new Emitter

  // Forward events
  server.on('error', emitter.emit.bind(emitter, 'error'))
  server.on('message', function (msg) {
    var port = server.address().port
    var parsed = BSON.deserialize(msg)
    log.test.message('mock appoptics (port ' + port + ') received', parsed)
    if (emitter.log) {
      console.log(parsed)
    }
    emitter.emit('message', parsed)

    if (emitter.forward) {
      udpSend(msg, realPort, '127.0.0.1')
    }
  })

  // Wait for the server to become available
  server.on('listening', function () {
    var port = server.address().port
    ao.port = port.toString()
    emitter.port = port
    debug('mock appoptics (port ' + port + ') listening')
    process.nextTick(done)
  })

  // Start mock tracelyzer
  server.bind(udpPort, 'localhost')

  // Expose some things through the emitter
  emitter.server = server

  // Attach close function to use in after()
  emitter.close = function (done) {
    var port = server.address().port
    server.on('close', function () {
      debug('mock appoptics (port ' + port + ') closed')
      process.nextTick(done)
    })
    server.close()
  }

  return emitter
}

exports.doChecks = function (emitter, checks, done) {
  var addr = emitter.server.address()
  emitter.removeAllListeners('message')

  debug('doChecks invoked with server address ' + addr.address + ':' + addr.port)

  function onMessage (msg) {
    //log.test.message('mock (' + addr.port + ') received message', msg)
    var check = checks.shift()
    if (check) {
      if (emitter.skipOnMatchFail) {
        try { check(msg) }
        catch (e) { checks.unshift(check) }
      } else {
        check(msg)
      }
    }

    // Always verify that X-Trace and Edge values are valid
    msg.should.have.property('X-Trace').and.match(/^2B[0-9A-F]{58}$/)
    if (msg.Edge) msg.Edge.should.match(/^[0-9A-F]{16}$/)

    debug(checks.length + ' checks left')
    if ( ! checks.length) {
      // NOTE: This is only needed because some
      // tests have less checks than messages
      emitter.removeListener('message', onMessage)
      done()
      if (emitter.forward) {
        console.log('Trace Link:', exports.traceLink(msg['X-Trace']))
      }
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

exports.test = function (emitter, test, validations, done) {
  function noop () {}
  // noops skip testing the 'outer' span.
  validations.unshift(noop)
  validations.push(noop)
  exports.doChecks(emitter, validations, done)

  ao.requestStore.run(function () {
    var span = new ao.Span('outer')
    // span.async = true
    span.enter()

    log.test.info('test started')
    test(function (err, data) {
      log.test.info('test ended: ' + (err ? 'failed' : 'passed'))
      if (err) return done(err)
      span.exit()
    })
  })
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
    http.get('http://localhost:' + port, function (res) {
      res.resume()
    }).on('error', done)
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
    https.get('https://localhost:' + port, function (res) {
      res.resume()
    }).on('error', done)
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

  context.ao = ao

  return function (done) {
    return mod.run(context, done)
  }
}

exports.after = function (n, done) {
  return function () {
    --n || done()
  }
}

exports.traceLink = function (id) {
  return 'https://stephenappneta.ao.solarwinds.com/traces/view/' + id.substr(2, 40)
}

function Address (host, port) {
  this.host = host
  this.port = port
}
exports.Address = Address
Address.prototype.toString = function () {
  return this.host + ':' + this.port
}

Address.from = function (input) {
  return input.split(',').map(function (name) {
    var parts = name.split(':')
    var host = parts.shift()
    var port = parts.shift() || ''
    return new Address(host, port)
  })
}

exports.setUntil = function (obj, prop, value, done) {
  var old = obj[prop]
  obj[prop] = value
  return function () {
    obj[prop] = old
    done.apply(this, arguments)
  }
}

exports.linksTo = linksTo
function linksTo (a, b) {
  a.Edge.should.eql(b['X-Trace'].substr(42, 16))
}

exports.edgeTracker = edgeTracker
function edgeTracker (parent, fn) {
  var started = false
  function tracker (msg) {
    // Verify link to last message in parent
    if ( ! started) {
      if (parent) {
        linksTo(msg, parent.last)
      }
      started = true
    }

    // Verify link to last message in this branch
    if (tracker.last) {
      linksTo(msg, tracker.last)
    }

    tracker.last = msg
    if (fn) fn(msg)
  }

  return tracker
}

exports.checkEntry = checkEntry
function checkEntry (name, fn) {
  return function (msg) {
    msg.should.have.property('X-Trace')
    msg.should.have.property('Label', 'entry')
    msg.should.have.property('Layer', name)
    if (fn) fn(msg)
  }
}

exports.checkExit = checkExit
function checkExit (name, fn) {
  return function (msg) {
    msg.should.have.property('X-Trace')
    msg.should.have.property('Label', 'exit')
    msg.should.have.property('Layer', name)
    if (fn) fn(msg)
  }
}

exports.checkInfo = checkInfo
function checkInfo (data, fn) {
  var withData = checkData(data)
  return function (msg) {
    msg.should.not.have.property('Layer')
    msg.should.have.property('Label', 'info')
    withData(msg)
    if (fn) fn(msg)
  }
}

exports.checkError = checkError
function checkError (error, fn) {
  return function (msg) {
    msg.should.not.have.property('Layer')
    msg.should.have.property('Label', 'error')
    msg.should.have.property('ErrorClass', 'Error')
    msg.should.have.property('ErrorMsg', error.message)
    msg.should.have.property('Backtrace', error.stack)
    if (fn) fn(msg)
  }
}

exports.checkData = checkData
function checkData (data, fn) {
  return function (msg) {
    Object.keys(data).forEach(function (key) {
      msg.should.have.property(key, data[key])
    })
    if (fn) fn(msg)
  }
}
