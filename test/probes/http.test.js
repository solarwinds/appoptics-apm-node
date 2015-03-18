var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')

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

  // Yes, this is really, actually needed.
  // Sampling may actually prevent reporting,
  // if the tests run too fast. >.<
  beforeEach(function (done) {
    helper.padTime(done)
  })

  describe('http-server', function () {
    //
    // Test a simple res.end() call in an http server
    //
    it('should send traces for http routing and response layers', function (done) {
      var server = http.createServer(function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
        request('http://localhost:' + port)
      })
    })

    //
    // Verify X-Trace header results in a continued trace
    //
    it('should continue tracing when receiving an xtrace id header', function (done) {
      var server = http.createServer(function (req, res) {
        res.end('done')
      })

      var origin = new tv.Event()

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
          msg.should.have.property('Edge', origin.opId)
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
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
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
          msg.should.have.property('X-TV-Meta', 'foo')
          msg.should.have.property('SampleSource')
          msg.should.have.property('SampleRate')
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
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
        setTimeout(function () {
          res.end('done')
        }, 10)
      })

      helper.doChecks(emitter, [
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'entry')
        },
        function (msg) {
          msg.should.have.property('Layer', 'nodejs')
          msg.should.have.property('Label', 'exit')
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
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
          res.end('done')
        })

        helper.doChecks(emitter, [
          function (msg) {
            msg.should.have.property('Layer', 'nodejs')
            msg.should.have.property('Label', 'entry')
            msg.should.have.property(val, 'test')
          },
          function (msg) {
            msg.should.have.property('Layer', 'nodejs')
            msg.should.have.property('Label', 'exit')
          }
        ], function () {
          server.close(done)
        })

        server.listen(function () {
          var port = server.address().port
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
  		},
  		'http-exit': function (msg) {
        msg.should.have.property('Layer', 'nodejs')
        msg.should.have.property('Label', 'exit')
  		}
  	}

    it('should trace http request', function (done) {
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

    it('should support object-based requests', function (done) {
      var server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        var d = ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'http/client-object')
        var url = 'http://' + d.hostname + ':' + d.port + d.path

        helper.httpTest(emitter, mod, [
          function (msg) {

            msg.should.have.property('Layer', 'http-client')
            msg.should.have.property('Label', 'entry')
            msg.should.have.property('RemoteURL', url)
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

    it('should trace streaming http request', function (done) {
      var server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'http/stream')

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
