var debug = require('debug')('probes-http')
var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon

var request = require('request')
var http = require('http')

describe('probes.http', function () {
  var ctx = { http: http }
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  describe('http-server', function () {
    //
    // Test a simple res.end() call in an http server
    //
    it('should send traces for http routing and response layers', function (done) {
      var server = http.createServer(function (req, res) {
        debug('request started')
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
          debug('entry is valid')
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
          debug('exit is valid')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
        debug('test server listening on port ' + port)
        request('http://localhost:' + port)
      })
    })

    //
    // Test multiple writes to the response in an http server
    //
    it('should send traces for each write to response stream', function (done) {
      var server = http.createServer(function (req, res) {
        debug('request started')
        res.write('wait...')
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
          debug('entry is valid')
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
          debug('exit is valid')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
        debug('test server listening on port ' + port)
        request('http://localhost:' + port)
      })
    })

    //
    // Verify X-Trace header results in a continued trace
    //
    it('should continue tracing when receiving an xtrace id header', function (done) {
      var server = http.createServer(function (req, res) {
        debug('request started')
        res.end('done')
      })

      var origin = new tv.Event()

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
          msg.should.have.property('Edge', origin.opId)
          debug('entry is valid')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
        debug('test server listening on port ' + port)
        request({
          url: 'http://localhost:' + port,
          headers: {
            'X-Trace': origin.toString()
          }
        })
      })
    })

    //
    // Verify always trace mode forwards X-TV-Meta header and sampling data
    //
    it('should forward X-TV-Meta header and sampling data in always trace mode', function (done) {
      var server = http.createServer(function (req, res) {
        debug('request started')
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
          msg.should.have.property('X-TV-Meta', 'foo')
          msg.should.have.property('SampleSource')
          msg.should.have.property('SampleRate')
          debug('entry is valid')
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
          debug('exit is valid')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
        debug('test server listening on port ' + port)
        request({
          url: 'http://localhost:' + port,
          headers: {
            'X-TV-Meta': 'foo'
          }
        })
      })
    })

    //
    // Verify behaviour of asyncrony within a request
    //
    it('should trace correctly within asyncrony', function (done) {
      var server = http.createServer(function (req, res) {
        debug('request started')
        setTimeout(function () {
          res.end('done')
        }, 10)
      })

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
          debug('entry is valid')
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
          debug('exit is valid')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
        debug('test server listening on port ' + port)
        request('http://localhost:' + port)
      })
    })

    //
    // Validate the various headers that get passed through to the event
    //
    var passthroughHeaders = {
      'X-Forwarded-For': 'Forwarded-For',
      'X-Forwarded-Host': 'Forwarded-Host',
      'X-Forwarded-Port': 'Forwarded-Port',
      'X-Forwarded-Proto': 'Forwarded-Proto',
      'X-Request-Start': 'Request-Start',
      'X-Queue-Start': 'Request-Start',
      'X-Queue-Time': 'Queue-Time'
    }

    Object.keys(passthroughHeaders).forEach(function (key) {
      var val = passthroughHeaders[key]

      var headers = {}
      headers[key] = 'test'

      it('should map ' + key + ' header to event.' + val, function (done) {
        var server = http.createServer(function (req, res) {
          debug('request started')
          res.end('done')
        })

        helper.doChecks(emitter, [
          function (msg) {
            msg.should.have.property('Layer', 'nodejs')
            msg.should.have.property('Label', 'entry')
            msg.should.have.property(val, 'test')
            debug('entry is valid')
          }
        ], function () {
          server.close(done)
        })

        server.listen(function () {
          var port = server.address().port
          debug('test server listening on port ' + port)
          var options = {
            url: 'http://localhost:' + port,
            headers: headers
          }
          request(options)
        })
      })
    })
  })

  describe('http-client', function () {
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

    // TODO: Verify edges...kind of hard with all the regex matching...
    it('should trace http-client', function (done) {
      var server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'http/client')

        helper.httpTest(emitter, mod, [
          function (msg) {
            msg.should.have.property('Layer', 'http-client')
            msg.should.have.property('Label', 'entry')
            msg.should.have.property('RemoteURL', ctx.data.url)
            msg.should.have.property('IsService', 'yes')
          },
          function (msg) {
            check['http-entry'](msg)
          },
          function (msg) {
            check['http-exit'](msg)
          },
          function (msg) {
            msg.should.have.property('Layer', 'http-client')
            msg.should.have.property('Label', 'exit')
            msg.should.have.property('HTTPStatus', 200)
          }
        ], done)
      })
    })
  })
})
