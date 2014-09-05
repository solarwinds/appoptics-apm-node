var debug = require('debug')('probes-redis')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var request = require('request')
var http = require('http')

var redis = require("redis")
var client = redis.createClient()

describe('probes.redis', function () {
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

	var check = {
		'http-entry': function (msg) {
			msg.should.match(/Layer\W*nodejs/)
			msg.should.match(/Label\W*entry/)
			debug('entry is valid')
		},
		'http-exit': function (msg) {
			msg.should.match(/Layer\W*nodejs/)
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

  //
  // Test a simple res.end() call in an http server
  //
  it('should support single commands', function (done) {
    httpTest(function (done) {
      client.set('foo', 'bar', done)
    }, [
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*entry/)
        msg.should.match(/KVOp\W*set/)
        msg.should.match(/KVKey\W*foo/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*exit/)
        msg.should.match(/KVHit\W*/)
      }
    ], done)
  })

  //
  // Test a simple res.end() call in an http server
  //
  it('should support multi', function (done) {
    var steps = [
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*entry/)
        msg.should.match(/KVOp\W*MULTI/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*entry/)
        msg.should.match(/KVOp\W*set/)
        msg.should.match(/KVKey\W*foo/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*entry/)
        msg.should.match(/KVOp\W*get/)
        msg.should.match(/KVKey\W*foo/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*entry/)
        msg.should.match(/KVOp\W*EXEC/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*exit/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*exit/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*exit/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*exit/)
      }
    ]

    httpTest(function (done) {
      client.multi()
        .set('foo', 'bar')
        .get('foo')
        .exec(done)
    }, steps, done)
  })

})
