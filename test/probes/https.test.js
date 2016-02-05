var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')

var request = require('request')
var https = require('https')

describe('probes.https', function () {
  var ctx = { https: https }
  var emitter

  var options = {
    key: "-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9\nKWso/+vHhkp6Cmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5Npzd\nQwNROKN8EPoKjlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQAB\nAoGBAJTD9/r1n5/JZ+0uTIzf7tx1kGJh7xW2xFtFvDIWhV0wAJDjfT/t10mrQNtA\n1oP5Fh2xy9YC+tZ/cCtw9kluD93Xhzg1Mz6n3h+ZnvnlMb9E0JCgyCznKSS6fCmb\naBz99pPJoR2JThUmcuVtbIYdasqxcHStYEXJH89Ehr85uqrBAkEA31JgRxeuR/OF\n96NJFeD95RYTDeN6JpxJv10k81TvRCxoOA28Bcv5PwDALFfi/LDya9AfZpeK3Nt3\nAW3+fqkYdQJBAMVV37vFQpfl0fmOIkMcZKFEIDx23KHTjE/ZPi9Wfcg4aeR4Y9vt\nm2f8LTaUs/buyrCLK5HzYcX0dGXdnFHgCaUCQDSc47HcEmNBLD67aWyOJULjgHm1\nLgIKsBU1jI8HY5dcHvGVysZS19XQB3Zq/j8qMPLVhZBWA5Ek41Si5WJR1EECQBru\nTUpi8WOpia51J1fhWBpqIbwevJ2ZMVz0WPg85Y2dpVX42Cf7lWnrkIASaz0X+bF+\nTMPuYzmQ0xHT3LGP0cECQQCqt4PLmzx5KtsooiXI5NVACW12GWP78/6uhY6FHUAF\nnJl51PB0Lz8F4HTuHhr+zUr+P7my7X3b00LPog2ixKiO\n-----END RSA PRIVATE KEY-----",
    cert: "-----BEGIN CERTIFICATE-----\nMIICWDCCAcGgAwIBAgIJAPIHj8StWrbJMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV\nBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX\naWRnaXRzIFB0eSBMdGQwHhcNMTQwODI3MjM1MzUwWhcNMTQwOTI2MjM1MzUwWjBF\nMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50\nZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB\ngQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9KWso/+vHhkp6\nCmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5NpzdQwNROKN8EPoK\njlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQABo1AwTjAdBgNV\nHQ4EFgQUTqL/t/yOtpAxKuC9zVm3PnFdRqAwHwYDVR0jBBgwFoAUTqL/t/yOtpAx\nKuC9zVm3PnFdRqAwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOBgQBn1XAm\nAsVdXKr3aiZIgOmw5q+F1lKNl/CHtAPCqwjgntPGhW08WG1ojhCQcNaCp1yfPzpm\niaUwFrgiz+JD+KvxvaBn4pb95A6A3yObADAaAE/ZfbEA397z0RxwTSVU+RFKxzvW\nyICDpugdtxRjkb7I715EjO9R7LkSe5WGzYDp/g==\n-----END CERTIFICATE-----"
  }

  var originalFlag

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    // Awful hack
    originalFlag = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

    emitter = helper.tracelyzer(done)
    tv.sampleRate = addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalFlag

    emitter.close(done)
  })

  var check = {
    server: {
      entry: function (msg) {
        msg.should.have.property('Layer', 'nodejs')
        msg.should.have.property('Label', 'entry')
      },
      info: function (msg) {
        msg.should.have.property('Label', 'info')
      },
      exit: function (msg) {
        msg.should.have.property('Layer', 'nodejs')
        msg.should.have.property('Label', 'exit')
      }
    },
    client: {
      entry: function (msg) {
        msg.should.have.property('Layer', 'https-client')
        msg.should.have.property('Label', 'entry')
      },
      info: function (msg) {
        msg.should.have.property('Label', 'info')
      },
      exit: function (msg) {
        msg.should.have.property('Layer', 'https-client')
        msg.should.have.property('Label', 'exit')
      }
    }
  }

  describe('https-server', function () {
    var conf = tv.https

    //
    // Test a simple res.end() call in an http server
    //
    it('should send traces for https routing and response layers', function (done) {
      var port
      var server = https.createServer(options, function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          msg.should.have.property('Method', 'GET')
          msg.should.have.property('Proto', 'https')
          msg.should.have.property('HTTP-Host', 'localhost')
          msg.should.have.property('Port', port)
          msg.should.have.property('URL', '/foo?bar=baz')
          msg.should.have.property('ClientIP')
        },
        function (msg) {
          check.server.exit(msg)
          msg.should.have.property('Status', 200)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        port = server.address().port
        request('https://localhost:' + port + '/foo?bar=baz')
      })
    })

    //
    // Verify X-Trace header results in a continued trace
    //
    it('should continue tracing when receiving an xtrace id header', function (done) {
      var server = https.createServer(options, function (req, res) {
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
          url: 'https://localhost:' + port,
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
      var server = https.createServer(options, function (req, res) {
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
          url: 'https://localhost:' + port,
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
      var server = https.createServer(options, function (req, res) {
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
        request('https://localhost:' + port)
      })
    })

    //
    // Verify query param filtering support
    //
    it('should support query param filtering', function (done) {
      conf.includeRemoteUrlParams = false
      var server = https.createServer(options, function (req, res) {
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
        request('https://localhost:' + port + '/foo?bar=baz')
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
        var server = https.createServer(options, function (req, res) {
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
            url: 'https://localhost:' + port,
            headers: headers
          }
          request(options)
        })
      })
    })

    //
    // Test errors emitted on http request object
    //
    it('should report request errors', function (done) {
      var error = new Error('test')
      var port
      var server = https.createServer(options, function (req, res) {
        req.on('error', noop)
        req.emit('error', error)
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
        },
        function (msg) {
          check.server.info(msg)
          msg.should.have.property('ErrorClass', 'Error')
          msg.should.have.property('ErrorMsg', error.message)
          msg.should.have.property('Backtrace', error.stack)
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        port = server.address().port
        request('https://localhost:' + port + '/foo?bar=baz')
      })
    })

    //
    // Test errors emitted on http response object
    //
    it('should report response errors', function (done) {
      var error = new Error('test')
      var port
      var server = https.createServer(options, function (req, res) {
        res.on('error', noop)
        res.emit('error', error)
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
        },
        function (msg) {
          check.server.info(msg)
          msg.should.have.property('ErrorClass', 'Error')
          msg.should.have.property('ErrorMsg', error.message)
          msg.should.have.property('Backtrace', error.stack)
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        port = server.address().port
        request('https://localhost:' + port + '/foo?bar=baz')
      })
    })

    //
    // Validate that server.setTimeout(...) exits correctly
    //
    function test_timeout (done) {
      var server = https.createServer(options, function (req, res) {
        setTimeout(function () {
          res.end('done')
        }, 20)
      })

      // Set timeout
      var reached = false
      server.setTimeout(10)
      server.on('timeout', function (res) {
        res._httpMessage.statusCode = 500
        reached = true
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
        },
        function (msg) {
          check.server.exit(msg)
          msg.should.have.property('Status', 500)
        }
      ], function () {
        reached.should.equal(true)
        server.close(done)
      })

      server.listen(function () {
        var port = server.address().port
        request('https://localhost:' + port)
      })
    }

    if (typeof https.Server.prototype.setTimeout === 'function') {
      it('should exit when timed out', test_timeout)
    } else {
      it.skip('should exit when timed out', test_timeout)
    }
  })

  describe('https-client', function () {
    var conf = tv['https-client']

    it('should trace https request', function (done) {
      var server = https.createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'https/client')

        helper.httpsTest(emitter, options, mod, [
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
      var server = https.createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        var d = ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'https/client-object')
        var url = 'https://' + d.hostname + ':' + d.port + d.path

        helper.httpsTest(emitter, options, mod, [
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

    it('should trace streaming https request', function (done) {
      var server = https.createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'https/stream')

        helper.httpsTest(emitter, options, mod, [
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

      var server = https.createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        var mod = helper.run(ctx, 'https/query-filtering')

        helper.httpsTest(emitter, options, mod, [
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

    it('should report request errors', function (done) {
      var server = https.createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        var port = server.address().port
        var url = 'https://localhost:' + port + '/?foo=bar'
        var error = new Error('test')

        helper.httpsTest(emitter, options, function (done) {
          var req = https.get(url, function (res) {
            res.on('end', done)
            res.resume()
          })
          req.on('error', function () {})
          req.emit('error', error)
        }, [
          function (msg) {
            check.client.entry(msg)
            msg.should.have.property('RemoteURL', url)
            msg.should.have.property('IsService', 'yes')
          },
          function (msg) {
            check.client.info(msg)
            msg.should.have.property('ErrorClass', 'Error')
            msg.should.have.property('ErrorMsg', error.message)
            msg.should.have.property('Backtrace', error.stack)
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

    it('should report response errors', function (done) {
      var server = https.createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        var port = server.address().port
        var url = 'https://localhost:' + port + '/?foo=bar'
        var error = new Error('test')

        helper.httpsTest(emitter, options, function (done) {
          https.get(url, function (res) {
            res.on('error', done.bind(null, null))
            res.emit('error', error)
          }).on('error', done)
        }, [
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
          },
          function (msg) {
            check.server.info(msg)
            msg.should.have.property('ErrorClass', 'Error')
            msg.should.have.property('ErrorMsg', error.message)
            msg.should.have.property('Backtrace', error.stack)
          }
        ], done)
      })
    })
  })
})

function noop () {}
