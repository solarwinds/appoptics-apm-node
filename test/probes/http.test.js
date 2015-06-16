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

  var check = {
    server: {
      entry: function (msg) {
        msg.should.have.property('Layer', 'nodejs')
        msg.should.have.property('Label', 'entry')
      },
      exit: function (msg) {
        msg.should.have.property('Layer', 'nodejs')
        msg.should.have.property('Label', 'exit')
      }
    },
    client: {
      entry: function (msg) {
        msg.should.have.property('Layer', 'http-client')
        msg.should.have.property('Label', 'entry')
      },
      exit: function (msg) {
        msg.should.have.property('Layer', 'http-client')
        msg.should.have.property('Label', 'exit')
      }
    }
  }

  describe('http-server', function () {
    var conf = tv.http

    //
    // Test a simple res.end() call in an http server
    //
    it('should send traces for http routing and response layers', function (done) {
      var port
      var server = http.createServer(function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          msg.should.have.property('Method', 'GET')
          msg.should.have.property('Proto', 'http')
          msg.should.have.property('HTTP-Host', 'localhost')
          msg.should.have.property('Port', port)
          msg.should.have.property('URL', '/foo?bar=baz')
          msg.should.have.property('ClientIP')
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        port = server.address().port
        request('http://localhost:' + port + '/foo?bar=baz')
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
          check.server.entry(msg)
          msg.should.have.property('Edge', origin.opId)
        },
        function (msg) {
          check.server.exit(msg)
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
          check.server.entry(msg)
          msg.should.have.property('X-TV-Meta', 'foo')
          msg.should.have.property('SampleSource')
          msg.should.have.property('SampleRate')
        },
        function (msg) {
          check.server.exit(msg)
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
          check.server.entry(msg)
        },
        function (msg) {
          check.server.exit(msg)
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
    // Verify query param filtering support
    //
    it('should support query param filtering', function (done) {
      conf.includeRemoteUrlParams = false
      var server = http.createServer(function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          msg.should.have.property('URL', '/foo')
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function (err) {
        conf.includeRemoteUrlParams = true
        server.close(done.bind(null, err))
      })

      server.listen(function () {
        var port = server.address().port
        request('http://localhost:' + port + '/foo?bar=baz')
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
            check.server.entry(msg)
            msg.should.have.property(val, 'test')
          },
          function (msg) {
            check.server.exit(msg)
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
    var conf = tv['http-client']

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
            check.client.entry(msg)
            msg.should.have.property('RemoteURL', ctx.data.url)
            msg.should.have.property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
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
            check.client.entry(msg)
            msg.should.have.property('RemoteURL', url)
            msg.should.have.property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
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
            check.client.entry(msg)
            msg.should.have.property('RemoteURL', ctx.data.url)
            msg.should.have.property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            msg.should.have.property('HTTPStatus', 200)
          }
        ], done)
      })
    })

    it('should support query filtering', function (done) {
      conf.includeRemoteUrlParams = false

      var server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'http/query-filtering')

        helper.httpTest(emitter, mod, [
          function (msg) {
            check.client.entry(msg)
            var url = ctx.data.url.replace(/\?.*/, '')
            msg.should.have.property('RemoteURL', url)
            msg.should.have.property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            msg.should.have.property('HTTPStatus', 200)
            conf.includeRemoteUrlParams = true
          }
        ], done)
      })
    })
  })
})
