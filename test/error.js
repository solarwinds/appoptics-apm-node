var debug = require('debug')('traceview:test:error')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var request = require('request')
var http = require('http')

var redis = require('redis')
var client = redis.createClient()

describe('error', function () {
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
  // Test a simple res.end() call in an http server
  //
  it('should add error properties to exit', function (done) {
    helper.httpTest(emitter, function (done) {
      client.set('foo', null, function (err) {
        done()
      })
    }, [
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*entry/)
        msg.should.match(/KVOp\W*set/)
      },
      function (msg) {
        msg.should.match(/Layer\W*redis/)
        msg.should.match(/Label\W*exit/)
        msg.should.match(/ErrorClass\W*Error/)
        msg.should.match(/ErrorMsg\W*/)
        msg.should.match(/Backtrace\W*/)
      }
    ], done)
  })

})
