'use strict'

const helper = require('../helper')
const {ao} = require('../1.test-common')
const expect = require('chai').expect
const util = require('util')

const addon = ao.addon

const request = require('request')
const http = require('http')

describe('probes.http', function () {
  const ctx = {http: http}
  let emitter
  let realSampleTrace
  const previousHttpEnabled = ao.probes.http.enabled
  const previousHttpClientEnabled = ao.probes['http-client'].enabled
  let clear

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    realSampleTrace = ao.addon.Context.sampleTrace
    ao.addon.Context.sampleTrace = function () {
      return {sample: true, source: 6, rate: ao.sampleRate}
    }
    ao.g.testing(__filename)
  })
  after(function (done) {
    ao.addon.Context.sampleTrace = realSampleTrace
    emitter.close(done)
  })
  after(function () {
    ao.loggers.debug(`enters ${ao.Span.entrySpanEnters} exits ${ao.Span.entrySpanExits}`)
  })


  beforeEach(function () {
    if (this.currentTest.title === 'should not report anything when http probe is disabled') {
      ao.probes.http.enabled = false
      ao.probes['http-client'].enabled = false
    } else if (this.currentTest.title === 'should trace correctly within asyncrony') {
      //this.skip()
    } else if (this.currentTest.title === 'should not send a span or metrics when there is a filter for it') {
      //this.skip()
    }
  })

  afterEach(function () {
    if (this.currentTest.title === 'should not report anything when http probe is disabled') {
      ao.probes.http.enabled = previousHttpEnabled
      ao.probes['http-client'].enabled = previousHttpClientEnabled
    } else if (this.currentTest.title === 'should not send a span when there is a filter for it') {
      ao.specialUrls = undefined
    }
  })
  afterEach(function () {
    if (clear) {
      clear()
      clear = undefined
    }
  })

  const check = {
    server: {
      entry: function (msg) {
        expect(msg).property('Layer', 'nodejs')
        expect(msg).property('Label', 'entry')
      },
      info: function (msg) {
        expect(msg).property('Label', 'info')
      },
      error: function (msg) {
        expect(msg).property('Label', 'error')
      },
      exit: function (msg) {
        expect(msg).property('Layer', 'nodejs')
        expect(msg).property('Label', 'exit')
      }
    },
    client: {
      entry: function (msg) {
        expect(msg).property('Layer', 'http-client')
        expect(msg).property('Label', 'entry')
      },
      info: function (msg) {
        expect(msg).property('Label', 'info')
      },
      error: function (msg) {
        expect(msg).property('Label', 'error')
      },
      exit: function (msg) {
        expect(msg).property('Layer', 'http-client')
        expect(msg).property('Label', 'exit')
      }
    }
  }

  describe('http-server', function () {
    const conf = ao.probes.http

    // it's possible for a local UDP send to fail but oboe doesn't report
    // it, so compensate for it.
    it('UDP might lose a message running locally', function (done) {
      helper.test(emitter, function (done) {
        ao.instrument('fake', function () {})
        done()
      }, [
        function (msg) {
          expect(msg).property('Label').oneOf(['entry', 'exit']),
          expect(msg).property('Layer', 'fake')
        }
      ], done)
    })

    //
    // Test a simple res.end() call in an http server
    //
    it('should send traces for http routing and response spans', function (done) {
      let port
      const server = http.createServer(function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).property('Method', 'GET')
          expect(msg).property('Proto', 'http')
          expect(msg).property('HTTP-Host', 'localhost')
          expect(msg).property('Port', port)
          expect(msg).property('URL', '/foo?bar=baz')
          expect(msg).property('ClientIP')
        },
        function (msg) {
          check.server.exit(msg)
          expect(msg).property('Status', 200)
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
      const server = http.createServer(function (req, res) {
        res.end('done')
      })

      const originMetadata = addon.Metadata.makeRandom(1)
      const origin = new ao.Event('span-name', 'label-name', originMetadata)

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).property('Edge', origin.opId)
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        request({
          url: 'http://localhost:' + port,
          headers: {
            'X-Trace': origin.toString()
          }
        })
      })
    })

    //
    // Verify that a bad X-Trace header does not result in a continued trace
    //
    it('should not continue tracing when receiving a bad xtrace id header', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
      })

      const originMetadata = addon.Metadata.makeRandom(1)
      const origin = new ao.Event('span-name', 'label-name', originMetadata)
      const xtrace = origin.toString().slice(0, 42) + '0'.repeat(16) + '01'

      const logChecks = [
        {level: 'warn', message: `invalid X-Trace string "${xtrace}"`},
      ]
      let getCount  // eslint-disable-line
      [getCount, clear] = helper.checkLogMessages(logChecks)

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).not.property('Edge', origin.opId)
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        request({
          url: 'http://localhost:' + port,
          headers: {
            'X-Trace': xtrace
          }
        })
      })
    })

    //
    // Verify always trace mode forwards sampling data
    //
    it('should forward sampling data in always trace mode', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).property('SampleSource')
          expect(msg).property('SampleRate')
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        request({
          url: 'http://localhost:' + port
        })
      })
    })

    //
    // it should not create a trace at all when the http is disabled
    //
    it('should not report anything when http probe is disabled', function (done) {

      function deafListener (msg) {
        throw new Error('unexpected message: ' + util.format(msg))
      }

      const server = http.createServer(function (req, res) {
        setTimeout(function () {
          res.end('done')
          res.on('finish', function () {
            emitter.removeListener('message', deafListener)
            server.close(done)
          })
        }, 10)
      })

      emitter.removeAllListeners('message')
      emitter.on('message', deafListener)

      server.listen(function () {
        const port = server.address().port
        request({url: `http://localhost:${port}`})
      })

    })

    //
    // make sure url filters work when doMetrics is false.
    // (oboe doesn't forward metrics messages using UDP so this can't really
    // be tested end-to-end; we use a mock metricsSender - thanks maia.)
    //
    it('should not send a span or metrics when there is a filter for it', function (done) {
      let messageCount = 0
      let metricsCount = 0
      ao.specialUrls = [
        {string: '/filtered', doSample: false, doMetrics: false},
        {regex: '^/files/', doSample: false, doMetrics: false}
      ]

      function deafListener (msg) {
        messageCount += 1
      }

      function metricsSender (o) {
        metricsCount += 1
        return '/filtered'
      }
      const previousSendHttpSpan = ao.reporter.sendHttpSpan
      ao.reporter.sendHttpSpan = metricsSender

      const server = http.createServer(function (req, res) {
        setTimeout(function () {
          res.end('done')
        }, 10)
      })

      emitter.removeAllListeners('message')
      emitter.on('message', deafListener)

      server.listen(function () {
        const port = server.address().port
        request({url: `http://localhost:${port}/filtered`})
        request({url: `http://localhost:${port}/files/binary.data`})
      })

      // 1/4 second should be enough to get all messages. there's no clean way to
      // wait on an indeterminate number of UDP messages.
      setTimeout(function () {
        emitter.removeListener('message', deafListener)
        server.close(function () {
          // restore mockups
          ao.specialUrls = undefined
          ao.reporter.sendHttpSpan = previousSendHttpSpan
          // if messages were sent it's an error
          const error = messageCount === 0 && metricsCount === 0
          done(error ? undefined : new Error('messages should not be sent but were'))
        })
      }, 250)
    })

    //
    // Verify behaviour of asyncrony within a request
    //
    it('should trace correctly within asyncrony', function (done) {
      const server = http.createServer(function (req, res) {
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
        const port = server.address().port
        request('http://localhost:' + port)
      })
    })

    //
    // Verify query param filtering support
    //
    it('should support query param filtering', function (done) {
      conf.includeRemoteUrlParams = false
      const server = http.createServer(function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).property('URL', '/foo')
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function (err) {
        conf.includeRemoteUrlParams = true
        server.close(done.bind(null, err))
      })

      server.listen(function () {
        const port = server.address().port
        request('http://localhost:' + port + '/foo?bar=baz')
      })
    })

    //
    // Validate the various headers that get passed through to the event
    //
    const passthroughHeaders = {
      'X-Forwarded-For': 'Forwarded-For',
      'X-Forwarded-Host': 'Forwarded-Host',
      'X-Forwarded-Port': 'Forwarded-Port',
      'X-Forwarded-Proto': 'Forwarded-Proto',
      'X-Request-Start': 'Request-Start',
      'X-Queue-Start': 'Request-Start',
      'X-Queue-Time': 'Queue-Time'
    }

    Object.keys(passthroughHeaders).forEach(function (key) {
      const kvKey = passthroughHeaders[key]
      const headerValue = `test-${key}`

      const headers = {}
      headers[key] = headerValue

      it(`should map ${key} header to event.kv.${kvKey}`, function (done) {
        const server = http.createServer(function (req, res) {
          res.end('done')
        })

        helper.doChecks(emitter, [
          function (msg) {
            check.server.entry(msg)
            expect(msg).property(kvKey, headerValue)
          },
          function (msg) {
            check.server.exit(msg)
          }
        ], function () {
          server.close(done)
        })

        server.listen(function () {
          const port = server.address().port
          const options = {
            url: 'http://localhost:' + port,
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
      const error = new Error('test')
      let port
      const server = http.createServer(function (req, res) {
        req.on('error', noop)
        req.emit('error', error)
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
        },
        function (msg) {
          check.server.error(msg)
          expect(msg).property('ErrorClass', 'Error')
          expect(msg).property('ErrorMsg', error.message)
          expect(msg).property('Backtrace', error.stack)
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
    // Test errors emitted on http response object
    //
    it('should report response errors', function (done) {
      const error = new Error('test')
      let port
      const server = http.createServer(function (req, res) {
        res.on('error', noop)
        res.emit('error', error)
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
        },
        function (msg) {
          check.server.error(msg)
          expect(msg).property('ErrorClass', 'Error')
          expect(msg).property('ErrorMsg', error.message)
          expect(msg).property('Backtrace', error.stack)
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
    // Validate that server.setTimeout(...) exits correctly
    //
    it('should exit when timed out', function (done) {
      const server = http.createServer(function (req, res) {
        setTimeout(function () {
          res.end('done')
        }, 20)
      })

      // Set timeout
      let reached = false
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
          expect(msg).property('Status', 500)
        }
      ], function () {
        expect(reached).equal(true)
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        request('http://localhost:' + port)
      })
    })
  })

  //
  // http client tests
  //

  describe('http-client', function () {
    const conf = ao.probes['http-client']
    it('should trace http request', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = {port: server.address().port}
        const testFunction = helper.run(ctx, 'http/client')

        helper.test(emitter, testFunction, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('RemoteURL', ctx.data.url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
          }
        ], done)
      })
    })

    it('should support object-based requests', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        const d = ctx.data = {port: server.address().port}
        const mod = helper.run(ctx, 'http/client-object')
        const url = 'http://' + d.hostname + ':' + d.port + d.path

        helper.test(emitter, mod, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('RemoteURL', url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
          }
        ], done)
      })
    })

    it('should trace streaming http request', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = {port: server.address().port}
        const mod = helper.run(ctx, 'http/stream')

        helper.test(emitter, mod, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('RemoteURL', ctx.data.url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
          }
        ], done)
      })
    })

    it('should support query filtering', function (done) {
      conf.includeRemoteUrlParams = false

      const server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = {port: server.address().port}
        const mod = helper.run(ctx, 'http/query-filtering')

        helper.test(emitter, mod, [
          function (msg) {
            check.client.entry(msg)
            const url = ctx.data.url.replace(/\?.*/, '')
            expect(msg).property('RemoteURL', url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
            conf.includeRemoteUrlParams = true
          }
        ], done)
      })
    })

    it('should report request errors', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        const port = server.address().port
        const url = 'http://localhost:' + port + '/?foo=bar'
        const error = new Error('test')

        helper.test(emitter, function (done) {
          const req = http.get(url, function (res) {
            res.on('end', done)
            res.resume()
          })
          req.on('error', function () {})
          req.emit('error', error)
        }, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('RemoteURL', url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.client.error(msg)
            expect(msg).property('ErrorClass', 'Error')
            expect(msg).property('ErrorMsg', error.message)
            expect(msg).property('Backtrace', error.stack)
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
          }
        ], done)
      })
    })

    it('should report response errors', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        const port = server.address().port
        const url = 'http://localhost:' + port + '/?foo=bar'
        const error = new Error('test')

        helper.test(emitter, function (done) {
          http.get(url, function (res) {
            res.on('error', done.bind(null, null))
            res.emit('error', error)
          }).on('error', done)
        }, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('RemoteURL', url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
          },
          function (msg) {
            check.server.error(msg)
            expect(msg).property('ErrorClass', 'Error')
            expect(msg).property('ErrorMsg', error.message)
            expect(msg).property('Backtrace', error.stack)
          }
        ], done)
      })
    })
  })
})

function noop () {}
