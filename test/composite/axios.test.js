/* global it, describe, before, after */
'use strict'

const helper = require('../helper')
const ao = helper.ao
const addon = ao.addon

const axios = require('axios')
const http = require('http')

const expect = require('chai').expect

describe('composite.axios', function () {
  const ctx = { driver: http, p: 'http' }
  let emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  function xtraceComponents (xtrace) {
    const taskId = xtrace.slice(2, 42)
    const opId = xtrace.slice(42, 58)
    const flags = xtrace.slice(-2)
    return [taskId, opId, flags]
  }

  const check = {
    traceContext: function (msg) {
      const traceContext = msg['sw.trace_context']
      msg.should.have.property('sw.trace_context')
      const taskId = traceContext.split('-')[1]
      const opId = traceContext.split('-')[2]
      const flags = traceContext.split('-')[3]
      return [taskId, opId, flags]
    },
    server: {
      entry: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('nodejs:entry')
      },
      info: function (msg) {
        expect(msg).property('Label', 'info')
      },
      error: function (msg) {
        expect(msg).property('Label', 'error')
      },
      exit: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('nodejs:exit')
      }
    },
    client: {
      entry: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('http-client:entry')
      },
      info: function (msg) {
        expect(msg).property('Label', 'info')
      },
      error: function (msg) {
        expect(msg).property('Label', 'error')
      },
      exit: function (msg) {
        expect(`${msg.Layer}:${msg.Label}`).equal('http-client:exit')
      }
    }
  }

  //
  // server
  //
  describe('http-server', function () {
    const conf = ao.probes.http

    // it's possible for a local UDP send to fail but oboe doesn't report
    // it, so compensate for it.
    it('UDP might lose a message running locally', function (done) {
      helper.test(emitter, function (done) {
        ao.instrument('fake', function () { })
        done()
      }, [
        function (msg) {
          expect(msg).property('Label').oneOf(['entry', 'exit'])
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
        axios.get(`http://localhost:${port}/foo?bar=baz`)
      })
    })

    //
    // Verify traceparent/tracestate header results in a continued trace
    //
    it('should continue tracing when receiving an traceparent/tracestate header', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
      })

      const origin = new ao.Event('span-name', 'label-name', addon.Event.makeRandom(1))

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
        axios({
          url: 'http://localhost:' + port,
          headers: {
            traceparent: origin.toString(),
            tracestate: `sw=${origin.toString().split('-')[2]}-${origin.toString().split('-')[3]}`
          }
        })
      })
    })

    //
    // Verify that a bad traceparnet header does not result in a continued trace
    //
    it('should not continue tracing when receiving a bad xtrace id header', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
      })

      const origin = new ao.Event('span-name', 'label-name', addon.Event.makeRandom(1))
      const traceparent = origin.toString().slice(0, 42) + '0'.repeat(16) + '01'

      const logChecks = [
        { level: 'warn', message: `invalid X-Trace string "${traceparent}"` }
      ]
      //
      const [, clearLogMessageChecks] = helper.checkLogMessages(logChecks)

      helper.doChecks(emitter, [
        function (msg) {
          check.server.entry(msg)
          expect(msg).not.property('Edge', origin.opId)
        },
        function (msg) {
          check.server.exit(msg)
        }
      ], function () {
        clearLogMessageChecks()
        server.close(done)
      })

      server.listen(function () {
        const port = server.address().port
        axios({
          url: 'http://localhost:' + port,
          headers: {
            traceparent,
            tracestate: `sw=${origin.toString().split('-')[2]}-${origin.toString().split('-')[3]}`
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
        axios({
          url: 'http://localhost:' + port
        })
      })
    })

    //
    // Verify behaviour of asyncrony within a request
    //
    it('should trace correctly within asyncrony', function () {
      const server = http.createServer(function (req, res) {
        setTimeout(function () {
          res.end('done')
        }, 10)
      })

      const pb = new Promise((resolve, reject) => {
        helper.doChecks(emitter, [
          function (msg) {
            check.server.entry(msg)
          },
          function (msg) {
            check.server.exit(msg)
          }
        ], function () {
          server.close(resolve)
        })
      })

      const pa = new Promise((resolve, reject) => {
        server.listen(function () {
          const port = server.address().port
          axios('http://localhost:' + port)
            .then(resolve)
        })
      })

      return Promise.all([pa, pb])
    })

    //
    // Verify query param filtering support
    //
    it('should support query param filtering', function (done) {
      ao.probes['http-client'].enabled = false
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
        ao.probes['http-client'].enabled = true
        server.close(done.bind(null, err))
      })

      server.listen(function () {
        const port = server.address().port
        axios(`http://localhost:${port}/foo?bar=baz`)
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
      const val = passthroughHeaders[key]

      const headers = {}
      headers[key] = 'test'

      it(`should map ${key} header to event.` + val, function (done) {
        const server = http.createServer(function (req, res) {
          res.end('done')
        })

        helper.doChecks(emitter, [
          function (msg) {
            check.server.entry(msg)
            expect(msg).property(val, 'test')
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
          axios(options)
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
        axios('http://localhost:' + port + '/foo?bar=baz')
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
        axios('http://localhost:' + port + '/foo?bar=baz')
      })
    })

    //
    // Validate that server.setTimeout(...) exits correctly
    //
    it('should exit when timed out', function () {
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

      const pa = new Promise((resolve, reject) => {
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
          server.close(resolve)
        })
      })

      const pb = new Promise((resolve, reject) => {
        server.listen(function () {
          const port = server.address().port
          axios(`http://localhost:${port}`)
            .catch(e => {
              if (e.message !== 'Request failed with status code 500') {
                reject(e)
              }
            })
            .then(resolve)
        })
      })

      return Promise.all([pa, pb])
    })
  })

  //
  // client
  //
  describe('http-client', function () {
    const conf = ao.probes['http-client']

    it('should trace http.get', function (done) {
      const server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        const mod = helper.run(ctx, 'http/client')

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

    it('should trace http using axios.get', function (done) {
      const server = http.createServer(function (req, res) {
        axios.get('http://www.google.com')
          .then(response => {
            if (response.status !== 200) {
              ao.loggers.error('status', response.status)
            }
            res.end('done')
            server.close()
          })
          .catch(err => {
            ao.loggers.error('error', err)
            res.statusCode = 422
            res.end({ geterror: err.toString() })
            server.close()
          })
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        const mod = helper.run(ctx, 'http/client')
        let ptaskId, popId, pflags

        helper.test(emitter, mod, [
          function (msg) {
            check.client.entry(msg); // sometimes a semicolon really is needed
            [ptaskId, popId, pflags] = check.traceContext(msg)
            expect(msg).property('RemoteURL', ctx.data.url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },

          // check request.get('google')
          function (msg) {
            check.client.entry(msg)
          },
          function (msg) {
            check.client.exit(msg)
          },

          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
            const [taskId, opId, flags] = check.traceContext(msg)
            expect(taskId).equal(ptaskId)
            expect(opId).not.equal(popId)
            expect(flags).equal(pflags)
          }
        ], done)
      })
    })

    it('should trace http client and server using axios.get', function () {
      let resolve
      let reject
      const p = new Promise((res, rej) => { resolve = res; reject = rej }) // eslint-disable-line promise/param-names

      const url2 = 'http://www.google.com/'
      const server = http.createServer(function (req, res) {
        axios.get(url2)
          .then(response => {
            if (response.status !== 200) {
              ao.loggers.error('status', response.status)
            }
            res.end('done')
            server.close()
          })
          .catch(err => {
            ao.loggers.error('error', err)
            res.statusCode = 422
            res.end({ geterror: err.toString() })
            server.close()
            reject(err)
          })
          .then(resolve)
      })
      let ptaskId, popId, pflags

      server.listen(function () {
        const url = `http://localhost:${server.address().port}`
        axios.get(url)
          .then(response => {
            expect(response).property('headers').property('x-trace')
            const xt = xtraceComponents(response.headers['x-trace'])
            expect(xt[0]).equal(ptaskId)
            expect(xt[1]).equal(popId)
            expect(xt[2]).equal(pflags)
          })
          .catch(e => {
            reject(e)
          })

        helper.doChecks(emitter, [
          function (msg) {
            check.server.entry(msg)
          },
          // check request.get('google')
          function (msg) {
            check.client.entry(msg); // sometimes a semicolon really is needed
            [ptaskId, popId, pflags] = check.traceContext(msg)
            expect(msg).property('RemoteURL', url2)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
            const xt = check.traceContext(msg)
            expect(xt[0]).equal(ptaskId)
            expect(xt[1]).not.equal(popId)
            expect(xt[2]).equal(pflags);
            [, popId] = xt
          },
          function (msg) {
            check.server.exit(msg)
            const xt = check.traceContext(msg)
            expect(xt[0]).equal(ptaskId)
            expect(xt[1]).not.equal(popId)
            expect(xt[2]).equal(pflags);
            [, popId] = xt
          }
        ],
        () => undefined)
      })

      return p
    })

    it('should trace http using request.get.then', function (done) {
      const options = {
        method: 'get',
        url: 'http://www.google.com',
        resolveWithFullResponse: true
      }
      const server = http.createServer(function (req, res) {
        axios(options)
          .then(function (response) {
            if (response.status !== 200) {
              ao.loggers.error('status', response.status)
            }
            res.end('done')
            server.close()
          })
          .catch(function (err) {
            ao.loggers.error('error', err)
            res.statusCode = 422
            res.end({ geterror: err.toString() })
            server.close()
          })
      })

      server.listen(function () {
        ctx.data = { port: server.address().port }
        const mod = helper.run(ctx, 'http/client')
        let ptaskId, popId, pflags

        helper.test(emitter, mod, [
          function (msg) {
            check.client.entry(msg); // sometimes a semicolon is needed
            [ptaskId, popId, pflags] = check.traceContext(msg)
            expect(msg).property('RemoteURL', ctx.data.url)
            expect(msg).property('IsService', 'yes')
          },
          function (msg) {
            check.server.entry(msg)
          },

          // check request.get('google')
          function (msg) {
            check.client.entry(msg)
          },
          function (msg) {
            check.client.exit(msg)
          },

          function (msg) {
            check.server.exit(msg)
          },
          function (msg) {
            check.client.exit(msg)
            expect(msg).property('HTTPStatus', 200)
            const [taskId, opId, flags] = check.traceContext(msg)
            expect(taskId).equal(ptaskId)
            expect(opId).not.equal(popId)
            expect(flags).equal(pflags)
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
        const d = ctx.data = { port: server.address().port }
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
        ctx.data = { port: server.address().port }
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
        ctx.data = { port: server.address().port }
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

    // it's going to take fiddling with axios internals/http directly in order to
    // simulate an error. it was not too hard with request but there isn't a request
    // object to work with in axios.
    it.skip('should report socket errors sending request', function (done) {
      // the handler function should not called because the socket is aborted
      // by the client end as soon as a socket is assigned.
      const server = http.createServer({}, function (req, res) {
        throw new Error('unexpected request')
      })

      server.listen(function () {
        const port = server.address().port
        const url = `http://localhost:${port}/?foo=bar`
        const error = new Error('ECONN-FAKE')

        helper.test(
          emitter,
          function (done) {
            axios(url)
              .then(res => {

              })
              .catch(err => {
                done(err.message === 'ECONN-FAKE' ? undefined : err)
              })
            const req = {}
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
              expect(msg).property('RemoteURL', url.replace(`:${port}`, ''))
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
