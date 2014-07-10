var Emitter = require('events').EventEmitter
var should = require('should')
var dgram = require('dgram')

var oboe = require('..')
var addon = oboe.addon
oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE

var http = require('http')
var request = require('request')

function noop () {}

describe('probes.http', function () {
  var server = dgram.createSocket('udp4')
  var emitter = new Emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    oboe.traceMode = 'always'
    oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE

    emitter.on('error', server.close.bind(server))
    server.on('message', emitter.emit.bind(emitter, 'message'))
    server.on('error', emitter.emit.bind(emitter, 'error'))
    server.on('listening', done)

    server.bind(1234)

    // Connect to test server
    oboe.reporter = new addon.UdpReporter('127.0.0.1', 1234)
  })

  after(function (done) {
    server.on('close', done)
    server.close()
  })

  //
  // Generic message checkers for response events
  //
  var checkers = {
    'http-response-write-entry': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-write', 'i'))
      msg.should.match(/Label\W*entry/)
    },
    'http-response-write-exit': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-write', 'i'))
      msg.should.match(/Label\W*exit/)
    },
    'http-response-end-entry': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-end', 'i'))
      msg.should.match(/Label\W*entry/)
    },
    'http-response-end-exit': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-end', 'i'))
      msg.should.match(/Label\W*exit/)
    },
  }

  //
  // Test a simple res.end() call in an http server
  //
  it('should send traces for http routing and response layers', function (done) {
    var server = http.createServer(function (req, res) {
      res.end('done')
    })

    var checks = [
      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*entry/)
      },

      checkers['http-response-end-entry'],
      checkers['http-response-write-entry'],
      checkers['http-response-write-exit'],
      checkers['http-response-end-exit'],

      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*exit/)
        emitter.removeAllListeners('message')
        server.close(done)
      }
    ]

    emitter.on('message', function (msg) {
      checks.shift()(msg.toString())
    })

    server.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port)
    })
  })

  //
  // Test multiple writes to the response in an http server
  //
  it('should send traces for each write to response stream', function (done) {
    var server = http.createServer(function (req, res) {
      res.write('wait...')
      res.end('done')
    })

    var checks = [
      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*entry/)
      },

      checkers['http-response-write-entry'],
      checkers['http-response-write-exit'],

      // Note that, if the stream has been writtern to already,
      // calls to end will defer to calling write before ending
      checkers['http-response-end-entry'],
      checkers['http-response-write-entry'],
      checkers['http-response-write-exit'],
      checkers['http-response-end-exit'],

      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*exit/)
        emitter.removeAllListeners('message')
        server.close(done)
      }
    ]

    emitter.on('message', function (msg) {
      checks.shift()(msg.toString())
    })

    server.listen(function () {
      var port = server.address().port
      request('http://localhost:' + port)
    })
  })
})
