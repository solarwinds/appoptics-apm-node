/* global it, describe, before, beforeEach, after, afterEach */
'use strict'

//
// common file for http and https tests.
//

const helper = require('../helper')
const { ao } = require('../1.test-common')
const expect = require('chai').expect
const util = require('util')

const addon = ao.addon

const semver = require('semver')
const axios = require('axios')

if (process.env.SW_APM_TEST_HTTP !== 'http' && process.env.SW_APM_TEST_HTTP !== 'https') {
  throw new Error(`invalid value for SW_APM_TEST_HTTP: ${process.env.SW_APM_TEST_HTTP}`)
}

// p stands for protocol
const p = process.env.SW_APM_TEST_HTTP

const driver = require(p)

const createServer = function (options, requestListener) {
  return driver.createServer(options, requestListener)
}

const httpsOptions = {
  key: '-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9\nKWso/+vHhkp6Cmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5Npzd\nQwNROKN8EPoKjlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQAB\nAoGBAJTD9/r1n5/JZ+0uTIzf7tx1kGJh7xW2xFtFvDIWhV0wAJDjfT/t10mrQNtA\n1oP5Fh2xy9YC+tZ/cCtw9kluD93Xhzg1Mz6n3h+ZnvnlMb9E0JCgyCznKSS6fCmb\naBz99pPJoR2JThUmcuVtbIYdasqxcHStYEXJH89Ehr85uqrBAkEA31JgRxeuR/OF\n96NJFeD95RYTDeN6JpxJv10k81TvRCxoOA28Bcv5PwDALFfi/LDya9AfZpeK3Nt3\nAW3+fqkYdQJBAMVV37vFQpfl0fmOIkMcZKFEIDx23KHTjE/ZPi9Wfcg4aeR4Y9vt\nm2f8LTaUs/buyrCLK5HzYcX0dGXdnFHgCaUCQDSc47HcEmNBLD67aWyOJULjgHm1\nLgIKsBU1jI8HY5dcHvGVysZS19XQB3Zq/j8qMPLVhZBWA5Ek41Si5WJR1EECQBru\nTUpi8WOpia51J1fhWBpqIbwevJ2ZMVz0WPg85Y2dpVX42Cf7lWnrkIASaz0X+bF+\nTMPuYzmQ0xHT3LGP0cECQQCqt4PLmzx5KtsooiXI5NVACW12GWP78/6uhY6FHUAF\nnJl51PB0Lz8F4HTuHhr+zUr+P7my7X3b00LPog2ixKiO\n-----END RSA PRIVATE KEY-----',
  cert: '-----BEGIN CERTIFICATE-----\nMIICWDCCAcGgAwIBAgIJAPIHj8StWrbJMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV\nBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX\naWRnaXRzIFB0eSBMdGQwHhcNMTQwODI3MjM1MzUwWhcNMTQwOTI2MjM1MzUwWjBF\nMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50\nZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB\ngQCsJU2dO/K3oQEh9wo60VC2ajCZjIudc8cqHl9kKNKwc9lP4Rw9KWso/+vHhkp6\nCmx6Cshm6Hs00rPgZo9HmY//gcj0zHmNbagpmdvAmOudK8l5NpzdQwNROKN8EPoK\njlFEBMnZj136gF5YAgEN9ydcLtS2TeLmUG1Y3RR6ADjgaQIDAQABo1AwTjAdBgNV\nHQ4EFgQUTqL/t/yOtpAxKuC9zVm3PnFdRqAwHwYDVR0jBBgwFoAUTqL/t/yOtpAx\nKuC9zVm3PnFdRqAwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOBgQBn1XAm\nAsVdXKr3aiZIgOmw5q+F1lKNl/CHtAPCqwjgntPGhW08WG1ojhCQcNaCp1yfPzpm\niaUwFrgiz+JD+KvxvaBn4pb95A6A3yObADAaAE/ZfbEA397z0RxwTSVU+RFKxzvW\nyICDpugdtxRjkb7I715EjO9R7LkSe5WGzYDp/g==\n-----END CERTIFICATE-----'
}

const baseTracestateSpanId = '7a71b110e5e3588d'
const baseTracestateFlags = '01'
const baseTracestateTraceId = '1'.repeat(32)

const baseTraceparent = ['00', baseTracestateTraceId, baseTracestateSpanId, baseTracestateFlags].join('-')
const baseTracestateOrgPart = 'sw=' + [baseTracestateSpanId, baseTracestateFlags].join('-')

const otherTracestateOrgPart = 'sw=9999888855667788-01'

const options = p === 'https' ? httpsOptions : {}

describe(`probes.${p}`, function () {
  const ctx = { driver, p }
  let emitter
  const previousHttpEnabled = ao.probes[p].enabled
  let clear
  let originalFlag

  //
  // Intercept messages for analysis
  //
  before(function (done) {
    emitter = helper.backend(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.g.testing(__filename)
  })
  after(function (done) {
    emitter.close(done)
  })

  //
  before(function () {
    // Awful hack
    originalFlag = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  })
  after(function () {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalFlag
  })
  beforeEach(function () {
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
        expect(`${msg.Layer}:${msg.Label}`).equal('nodejs:entry')
      },
      info: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('undefined:info')
      },
      error: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('undefined:error')
      },
      exit: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('nodejs:exit')
      }
    },
    client: {
      entry: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal(`${p}-client:entry`)
      },
      info: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('undefined:info')
      },
      error: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('undefined:error')
      },
      exit: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal(`${p}-client:exit`)
      }
    }
  }

  //= ===============================================================================================
  // server tests
  //= ===============================================================================================
  describe(`${p}-server`, function () {
    const conf = ao.probes[p]

    // turn off http-client so the request is not part of the test.
    before(function () {
      ao.probes[`${p}-client`].enabled = false
    })

    after(function () {
      ao.probes[`${p}-client`].enabled = true
      // ao.resetRequestStore();
    })

    // disable the probe for the test that requires it.
    beforeEach(function () {
      if (this.currentTest.title === `should not report anything when ${p} probe is disabled`) {
        ao.probes[p].enabled = false
      }
    })

    afterEach(function () {
      if (this.currentTest.title === `should not report anything when ${p} probe is disabled`) {
        ao.probes[p].enabled = previousHttpEnabled
      } else if (this.currentTest.title === 'should not send a span when there is a filter for it') {
        ao.specialUrls = undefined
      }
    })

    // it's possible for a local UDP send to fail but oboe doesn't report
    // it, so compensate for it.
    it('UDP might lose a message running locally', function (done) {
      helper.test(emitter, function (done) {
        ao.instrument('fake', function () {})
        done()
      }, [
        function (msg) {
          expect(msg).property('Label').oneOf(['entry', 'exit'])
          expect(msg).property('Layer', 'fake')
        }
      ], done)
    })

    it(`should send traces for ${p} routing and response spans`, function (done) {
      let port
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).property('HTTPMethod', 'GET')
          expect(msg).property('Proto', p)
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
        axios(
          `${p}://localhost:${port}/foo?bar=baz`,
          function (error, response, body) {
            expect(response.headers).exist()
            expect(response.headers).property('x-trace')
          }
        )
      })
    })

    //
    // Verify w3c trace context
    //

    it('should start a "Source" trace when receiving no w3c headers', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      let trasportXtrace = ''

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).not.have.property('Edge')

          trasportXtrace = msg['X-Trace']
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        axios({
          url: `${p}://localhost:${port}`,
          headers: {}
        },
        function (error, response, body) {
          expect(response.headers).exist()
          expect(response.headers).property('x-trace')
          expect(trasportXtrace.slice(0, 42)).equal(response.headers['x-trace'].slice(0, 42))
        })
      })
    })

    it('should start a "Downstream" trace when receiving a traceparent only', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      let trasportXtrace = ''

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).not.have.property('Edge')

          trasportXtrace = msg['X-Trace']
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        axios({
          url: `${p}://localhost:${port}`,
          headers: {
            traceparent: baseTraceparent
          }
        },
        function (error, response, body) {
          expect(response.headers).exist()
          expect(response.headers).property('x-trace')
          expect(trasportXtrace.slice(0, 42)).equal(response.headers['x-trace'].slice(0, 42))
        })
      })
    })

    it('should continue "Flow" tracing when receiving a traceparent and tracestate that match', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      let trasportXtrace = ''

      helper.doChecks(emitter, [
        function (msg) {
          expect(msg).property('Edge', baseTracestateSpanId.toUpperCase())

          trasportXtrace = msg['X-Trace']
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        axios({
          url: `${p}://localhost:${port}`,
          headers: {
            traceparent: baseTraceparent,
            tracestate: baseTracestateOrgPart
          }
        },
        function (error, response, body) {
          expect(response.headers).exist()
          expect(response.headers).property('x-trace')
          expect(trasportXtrace.slice(0, 42)).equal(response.headers['x-trace'].slice(0, 42))
        })
      })
    })

    it('should continue "Continuation" tracing when receiving a traceparent and tracestate that do not match in header', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      let trasportXtrace = ''

      helper.doChecks(emitter, [
        function (msg) {
          // the edge in "Continuation" is from trace parent.
          expect(msg).property('Edge', otherTracestateOrgPart.slice(3).split('-')[0].toUpperCase())
          expect(msg).property('sw.tracestate_parent_id')
          expect(msg).property('sw.w3c.tracestate')

          trasportXtrace = msg['X-Trace']
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        axios({
          url: `${p}://localhost:${port}`,
          headers: {
            traceparent: baseTraceparent,
            tracestate: otherTracestateOrgPart
          }
        },
        function (error, response, body) {
          expect(response.headers).exist()
          expect(response.headers).property('x-trace')
          expect(trasportXtrace.slice(0, 42)).equal(response.headers['x-trace'].slice(0, 42))
        })
      })
    })

    //
    // Verify always trace mode forwards sampling data
    //
    it('should forward sampling data in always trace mode', function (done) {
      const server = createServer(options, function (req, res) {
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
        axios({ url: `${p}://localhost:${port}` })
      })
    })

    //
    // Verify that a bad traceparent header does not result in a continued trace
    //
    it('should not continue tracing when receiving a bad traceparent id header', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      const originMetadata = addon.Event.makeRandom(1)
      const origin = new ao.Event('span-name', 'label-name', originMetadata)
      const traceparent = origin.toString().split('-').map((part, index) => index === 2 ? '0'.repeat(15) : part).join('-')

      const logChecks = [
        { level: 'warn', message: `invalid traceparent string "${traceparent}"` }
      ];

      [, clear] = helper.checkLogMessages(logChecks)

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
        axios({
          url: `${p}://localhost:${port}`,
          headers: {
            traceparent,
            tracestate: baseTracestateOrgPart
          }
        },
        function (error, response, body) {
          expect(response.headers).exist()
          expect(response.headers).property('x-trace')
          expect(origin.taskId).not.equal(response.headers['x-trace'].slice(2, 42))
        })
      })
    })

    it('should not continue tracing when receiving only tracestate id header', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      const originMetadata = addon.Event.makeRandom(1)
      const origin = new ao.Event('span-name', 'label-name', originMetadata)

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
        axios({
          url: `${p}://localhost:${port}`,
          headers: { tracestate: baseTracestateOrgPart }
        },
        function (error, response, body) {
          expect(response.headers).exist()
          expect(response.headers).property('x-trace')
          expect(origin.taskId).not.equal(response.headers['x-trace'].slice(2, 42))
        })
      })
    })

    //
    // it should not create a trace at all when http is disabled
    //
    it(`should not report anything when ${p} probe is disabled`, function (done) {
      function deafListener (msg) {
        throw new Error('unexpected message: ' + util.format(msg))
      }

      const server = createServer(options, function (req, res) {
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
        axios({ url: `${p}://localhost:${port}` })
      })
    })

    //
    // make sure url filters work when doMetrics is false.
    // (oboe doesn't forward metrics messages using UDP so this can't really
    // be tested end-to-end; we use a mock metricsSender - thanks maia.)
    //
    it('should not send a span or metrics when a string or regex filter matches', function (done) {
      let messageCount = 0
      let metricsCount = 0
      ao.specialUrls = [
        { string: '/filtered', doSample: false, doMetrics: false },
        { regex: '^/files/', doSample: false, doMetrics: false }
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

      const server = createServer(options, function (req, res) {
        setTimeout(function () {
          res.end('done')
        }, 10)
      })

      emitter.removeAllListeners('message')
      emitter.on('message', deafListener)

      server.listen(function () {
        const port = server.address().port
        axios({ url: `${p}://localhost:${port}/filtered` })
        axios({ url: `${p}://localhost:${port}/files/binary.data` })
      })

      // 1/10 second should be enough to get all messages. there's no clean way to
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
      }, 100)
    })

    //
    // Verify behaviour of asyncrony within a request
    //
    it('should trace correctly within asyncrony', function (done) {
      const server = createServer(options, function (req, res) {
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
        server.close(function () {
          done()
        })
      })

      server.listen(function () {
        const port = server.address().port
        axios(`${p}://localhost:${port}`)
      })
    })

    //
    // Verify query param filtering support
    //
    it('should support query param filtering', function (done) {
      if (ao.lastEvent) {
        ao.loggers.debug(`${p}.test: before creating server lastEvent = %e`, ao.lastEvent)
      }

      conf.includeRemoteUrlParams = false
      const server = createServer(options, function (req, res) {
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
        axios(`${p}://localhost:${port}/foo?bar=baz`)
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
        const server = createServer(options, function (req, res) {
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
            url: `${p}://localhost:${port}`,
            headers: headers
          }
          axios(options)
        })
      })
    })

    it('should map a specific header to ClientIP when specified', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      ao.probes[p]['client-ip-header'] = 'x-real-ip'
      const ClientIPExpected = '777.777.333.333'

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).property('ClientIP', ClientIPExpected)
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
          url: `${p}://localhost:${port}`,
          headers: { 'x-real-ip': ClientIPExpected }
        }
        axios(options)
      })
    })

    it('should set ClientIP when req[\'client-ip-header\'] is undefined', function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
      })

      helper.doChecks(emitter, [
        function (msg) {
          // this checks that ClientIP is set.
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
        const options = {
          url: `${p}://localhost:${port}`
        }
        axios(options)
      })
    })

    //
    // Test errors emitted on http request object
    //
    it('should report request errors', function (done) {
      const error = new Error('test')
      let port
      const server = createServer(options, function (req, res) {
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
        axios(`${p}://localhost:${port}/foo?bar=baz`)
      })
    })

    //
    // Test errors emitted on http response object
    //
    it('should report response errors', function (done) {
      const error = new Error('test')
      let port
      const server = createServer(options, function (req, res) {
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
        axios(`${p}://localhost:${port}/food?bar=baz`)
      })
    })

    //
    // Test error when connection is aborted
    //
    it('should gracefully exit with no error when connection is aborted', function (done) {
      // AbortController added in node 16
      if (semver.satisfies(process.version, '< 16.0.0')) {
        return this.skip()
      }

      let port
      const server = createServer(options, function (req, res) {
        // server will never response and client will abort after 500 ms
      })

      helper.doChecks(emitter, [
        // there will only be an entry event as there is no response
        function (msg) {
          check.server.entry(msg)
        }
      ], function () {
        server.close(done)
      })

      const controller = new AbortController()

      server.listen(function () {
        port = server.address().port
        axios(`${p}://localhost:${port}/foo?bar=baz`, { signal: controller.signal })
        setTimeout(() => {
          // cancel the request
          controller.abort()
        }, 500)
      })
    })

    //
    // Validate that server.setTimeout(...) exits correctly
    //
    it('should exit when timed out', function (done) {
      const server = createServer(options, function (req, res) {
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
        axios(`${p}://localhost:${port}`)
      })
    })
  })

  //
  // http client tests
  //

  describe(`${p}-client`, function () {
    const conf = ao.probes[`${p}-client`]

    after(function () {
      ao.resetRequestStore()
    })

    it(`should trace ${p} request`, function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        const testFunction = helper.run(ctx, 'http/client.js')

        helper.test(emitter, testFunction, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('Spec', 'rsc')
            expect(msg).property('IsService', 'yes')
            expect(msg).property('RemoteURL', ctx.data.url)
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
      const server = createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        const d = ctx.data = { port: server.address().port }
        const mod = helper.run(ctx, 'http/client-object.js')
        const url = `${p}://${d.hostname}:${d.port}${d.path}`

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

    it(`should trace streaming ${p} request`, function (done) {
      const server = createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        const mod = helper.run(ctx, 'http/stream.js')

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

      const server = createServer(options, function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        const mod = helper.run(ctx, 'http/query-filtering.js')

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

    it('should report socket errors sending request', function (done) {
      // the handler function should not called because the socket is aborted
      // by the client end as soon as a socket is assigned.
      const server = createServer(options, function (req, res) {
        throw new Error('unexpected request')
      })

      server.listen(function () {
        const port = server.address().port
        const url = `${p}://localhost:${port}/?foo=bar`
        const error = new Error('ECONN-FAKE')

        helper.test(
          emitter,
          function (done) {
            const req = driver.get(url, function (res) {
              res.on('end', () => done(error))
              res.resume()
            })
            req.on('error', e => {
              server.close()
              done(e !== error ? e : undefined)
            })
            // simulate a socket error. just emitting an error doesn't simulate
            // a socket error because the request completes. when a real socket
            // error occurs there will be no server response.
            req.on('socket', socket => {
              socket.destroy(error)
            })
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
              check.client.exit(msg)
              // there is no HTTPStatus because the HTTP transaction didn't
              // complete.
              // expect(msg).property('HTTPStatus', 200)
            }
          ],
          done
        )
      })
    })

    it('should report socket errors when no server is listening', function (testDone) {
      // disable so we don't have to look for/exclude http spans.
      ao.probes[p].enabled = false
      const server = createServer(options, function (req, res) {
        throw new Error('the server got a request')
      })
      // reset on exit
      function done (err) {
        ao.probes[p].enabled = true
        server.close()
        testDone(err)
      }

      // fill in on the request 'error' event. it should be ECONNREFUSED.
      let error

      server.listen(function () {
        // set to a port that is not listening
        const port = server.address().port + 1
        const url = `${p}://localhost:${port}/?foo=bar`

        helper.test(
          emitter,
          function (done) {
            const req = driver.get(url, function (res) {
              // the 'end' event should never be emitted.
              res.on('end', () => done(new Error('unexpected end event')))
              res.resume()
            })
            req.on('error', e => {
              error = e
              // if it is the expected error then it's not an error
              done(e.code !== 'ECONNREFUSED' ? e : undefined)
            })
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
              check.client.exit(msg)
              // expect(msg).property('HTTPStatus', 200)
            }
          ],
          done
        )
      })
    })

    it('should report socket errors when the server hangs up', function (testDone) {
      // disable so we don't have to look for/exclude http spans in the
      // emitted output.
      ao.probes[p].enabled = false
      const server = createServer(options, function (req, res) {
        // this should result in ECONNRESET.
        // https://nodejs.org/api/http.html#http_http_request_url_options_callback
        req.socket.destroy()
      })
      // reset on exit
      function done (err) {
        ao.probes[p].enabled = true
        server.close()
        testDone(err)
      }
      // fill in on the req 'error' event.
      let error

      server.listen(function () {
        const port = server.address().port
        const url = `${p}://localhost:${port}/?foo=bar`

        helper.test(
          emitter,
          function (done) {
            const req = driver.get(url, function (res) {
              res.on('end', () => done(new Error('Unexpected end event')))
              res.resume()
            })
            req.on('error', e => {
              error = e
              done(e.code !== 'ECONNRESET' ? e : undefined)
            })
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
              check.client.exit(msg)
              // expect(msg).property('HTTPStatus', 200);
            }
          ],
          done
        )
      })
    })

    it('should not report an error if req.abort() is called', function (testDone) {
      // disable so we don't have to look for/exclude http spans in the
      // emitted output.
      ao.probes[p].enabled = false

      const server = createServer(options, function (req, res) {
        // send the response
        res.write('partial response\n')
        // but delay before finishing to give the client time to abort
        // the request.
        setTimeout(function () {
          res.write('more stuff\n')
          res.end()
        }, 100)
      })
      // reset on exit
      function done (err) {
        ao.probes[p].enabled = true
        server.close()
        testDone(err)
      }

      server.listen(function () {
        const port = server.address().port
        const url = `${p}://localhost:${port}/?foo=bar`

        helper.test(
          emitter,
          function (done) {
            const req = driver.get(url, function (res) {
              // when we get data abort the request
              res.on('data', function (err, data) {
                // req.abort() is deprecated as of 14.1.0; use
                // req.destroy() in the future but all current
                // code uses req.abort() so leave that for now.
                // req.destroy();
                req.abort()
              })
              res.on('end', () => {
                // end is not emitted when errors occur or when the
                // client aborts the connection. in any case it is
                // not the end of the request, so ignore it.
                // https://nodejs.org/api/http.html#http_event_close_2
              })
              res.resume()
            })
            // if there is an error the test fails
            req.on('error', e => {
              done(e)
            })
            // done when the socket is closed. the test should succeed.
            req.on('close', e => {
              // node 14 https://nodejs.org/api/http.html#http_request_destroy_error
              // console.log('close', req.aborted, req.destroyed, req.writableEnded);
              done(e)
            })
          }, [
            function (msg) {
              check.client.entry(msg)
              expect(msg).property('RemoteURL', url)
              expect(msg).property('IsService', 'yes')
            },
            function (msg) {
              check.client.exit(msg)
              expect(msg).property('HTTPStatus', 200)
            }
          ],
          done
        )
      })
    })

    it('should report an error when the server has a socket error', function (testDone) {
      // disable so we don't have to look for/exclude http spans in the
      // emitted output.
      ao.probes[p].enabled = false

      const error = new Error('SIMULATED-SOCKET-ERROR')

      const server = createServer(options, function (req, res) {
        // send the response interrupted by an error.
        res.write('partial response\n')
        // simulate a socket error.
        res.socket.emit('error', error)
        setTimeout(function () {
          res.write('more stuff\n')
          res.end()
        }, 20)
      })
      // reset on exit
      function done (err) {
        ao.probes[p].enabled = true
        server.close()
        testDone(err)
      }

      server.listen(function () {
        const port = server.address().port
        const url = `${p}://localhost:${port}/?foo=bar`

        helper.test(emitter, function (done) {
          server.on('error', e => {
            done(e)
          })
          driver.get(url, function (res) {
            res.on('error', done)
          })
            .on('error', e => {
              done(e.code === 'ECONNRESET' ? null : e)
            })
        }, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('RemoteURL', url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            expect(`${msg.Layer}:${msg.Label}`).equal('undefined:error')
            expect(msg).property('ErrorClass', 'Error')
            expect(msg).property('ErrorMsg', 'socket hang up')
            expect(msg).property('Backtrace')
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).not.property('HTTPStatus')
          }
        ],
        done
        )
      })
    })

    // not clear exactly what behavior should be here. i don't see how the
    // response object can emit an error except a socket error, already tested.
    // https://nodejs.org/api/http.html#http_event_clienterror
    it.skip('should report response errors handling request', function (testDone) {
      // disable so we don't have to look for/exclude http spans in the
      // emitted output.
      ao.probes[p].enabled = false

      let error

      const server = createServer(options, function (req, res) {
        // send the response interrupted by an error.
        res.write('partial response\n')
        setTimeout(function () {
          res.write('more stuff\n')
          res.end()
        }, 20)
      })
      // reset on exit
      function done (err) {
        ao.probes[p].enabled = true
        server.close()
        testDone(err)
      }

      server.listen(function () {
        const port = server.address().port
        const url = `${p}://localhost:${port}/?foo=bar`

        helper.test(emitter, function (done) {
          server.on('error', e => {
            done(e === error ? null : e)
          })
          driver.get(url, function (res) {
            res.on('error', e => {
              if (e !== error) {
                done(e)
              }
            })
            res.emit('error', (error = new Error('REQ-PROC-ERR')))
          })
        }, [
          function (msg) {
            check.client.entry(msg)
            expect(msg).property('RemoteURL', url)
            expect(msg).property('IsService', 'yes')
          },
          // function (msg) {
          //  expect(`${msg.Layer}:${msg.Label}`).equal('undefined:error');
          //  expect(msg).property('ErrorClass', 'Error');
          //  expect(msg).property('ErrorMsg', 'socket hang up');
          //  expect(msg).property('Backtrace');
          // },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
          }
        ],
        done
        )
      })
    })
  })
})

function noop () {}
