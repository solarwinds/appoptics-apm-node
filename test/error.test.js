var debug = require('debug')('traceview:test:error')
var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon
var Event = tv.Event

var request = require('request')
var http = require('http')

var redis = require('redis')
var db_host = process.env.REDIS_PORT_6379_TCP_ADDR || 'localhost'
var client = redis.createClient(6379, db_host, {})

describe('error', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
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

  //
  // Tests
  //
  it('should add error properties to event', function () {
    var event = new Event('error-test', 'info')
    var err = new Error('test')
    event.error = err

    event.should.have.property('ErrorClass', 'Error')
    event.should.have.property('ErrorMsg', err.message)
    event.should.have.property('Backtrace', err.stack)
  })

  it('should report errors in error-first callbacks', function (done) {
    helper.httpTest(emitter, function (done) {
      client.ready = false
      client.enable_offline_queue = false
      client.set('foo', null, function (err) {
        done()
      })
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'redis')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('KVOp', 'set')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        msg.should.have.property('Layer', 'redis')
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('ErrorClass', 'Error')
        msg.should.have.property('ErrorMsg')
        msg.should.have.property('Backtrace')
      }
    ], done)
  })

})
