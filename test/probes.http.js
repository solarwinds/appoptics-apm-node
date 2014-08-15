var debug = require('debug')('probes-http')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var request = require('request')
var http = require('http')

describe('probes.http', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE
    oboe.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  //
  // Helper to run checks against a server
  //
  function doChecks (checks, done) {
    emitter.on('message', function (msg) {
      var check = checks.shift()
      if (check) {
        check(msg.toString())
      }

      if ( ! checks.length) {
        emitter.removeAllListeners('message')
        done()
      }
    })
  }

  describe('http-server', function () {
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
        debug('request started')
        res.end('done')
      })

      doChecks([
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/Label\W*entry/)
          debug('entry is valid')
        },

        // checkers['http-response-end-entry'],
        // checkers['http-response-write-entry'],
        // checkers['http-response-write-exit'],
        // checkers['http-response-end-exit'],

        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/Label\W*exit/)
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

      doChecks([
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/Label\W*entry/)
          debug('entry is valid')
        },

        // checkers['http-response-write-entry'],
        // checkers['http-response-write-exit'],

        // Note that, if the stream has been writtern to already,
        // calls to end will defer to calling write before ending
        // checkers['http-response-end-entry'],
        // checkers['http-response-write-entry'],
        // checkers['http-response-write-exit'],
        // checkers['http-response-end-exit'],

        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/Label\W*exit/)
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

      var origin = new oboe.Event()

      doChecks([
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(new RegExp('Edge\\W*' + origin.opId, 'i'))
          msg.should.match(/Label\W*entry/)
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

      doChecks([
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/X-TV-Meta\W*foo/)
          msg.should.match(/SampleSource\W*/)
          msg.should.match(/SampleRate\W*/)
          msg.should.match(/Label\W*entry/)
          debug('entry is valid')
        },
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/Label\W*exit/)
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

      doChecks([
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/Label\W*entry/)
          debug('entry is valid')
        },
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(/Label\W*exit/)
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

        var checks = [
          function (msg) {
            msg.should.match(new RegExp('Layer\\W*http', 'i'))
            msg.should.match(new RegExp(val + '\\W*test', 'i'))
            msg.should.match(/Label\W*entry/)
            debug('entry is valid')
          }
        ]

        emitter.on('message', function (msg) {
          var check = checks.shift()
          if (check) {
            check(msg.toString())
          }

          if ( ! checks.length) {
            emitter.removeAllListeners('message')
            server.close(done)
          }
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
  			msg.should.match(/Layer\W*http/)
  			msg.should.match(/Label\W*entry/)
  			debug('entry is valid')
  		},
  		'http-exit': function (msg) {
  			msg.should.match(/Layer\W*http/)
  			msg.should.match(/Label\W*exit/)
  			debug('exit is valid')
  		}
  	}

  	function httpTest (test, validations, done) {
  		var server = http.createServer(function (req, res) {
  			debug('request started')
  			test(function (err, data) {
  				if (err) return done(err)
  				res.end('done')
  			})
  		})

  		validations.unshift(check['http-entry'])
  		validations.push(check['http-exit'])
  		doChecks(validations, function () {
  			server.close(done)
  		})

  		server.listen(function () {
  			var port = server.address().port
  			debug('test server listening on port ' + port)
  			request('http://localhost:' + port)
  		})
  	}

    // TODO: Verify edges...kind of hard with all the regex matching...
    it('should trace http-client', function (done) {
      var server = http.createServer(function (req, res) {
        res.end('done')
        server.close()
      })

      server.listen(function () {
        var port = server.address().port
        var url = 'http://localhost:' + port

        httpTest(function (done) {
          http.get(url, done.bind(null, null)).on('error', done)
        }, [
          function (msg) {
            msg.should.match(/Layer\W*http-client/)
            msg.should.match(/ServiceArg\W*\//)
            msg.should.match(/RemoteHost\W*localhost:\d*/)
            msg.should.match(/RemoteProtocol\W*http/)
            msg.should.match(/IsService\W*yes/)
            msg.should.match(/Label\W*entry/)
          },
          function () {},
          function () {},
          function (msg) {
            msg.should.match(/Layer\W*http-client/)
            msg.should.match(/HTTPStatus\W*\d*/)
            msg.should.match(/Label\W*exit/)
          }
        ], done)
      })
    })
  })
})
