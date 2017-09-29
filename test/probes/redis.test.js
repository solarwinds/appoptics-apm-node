var helper = require('../helper')
var Address = helper.Address
var ao = helper.ao
var addon = ao.addon

var should = require('should')

var request = require('request')
var http = require('http')

var redis = require('redis')
var parts = (process.env.TEST_REDIS_3_0 || 'redis:6379').split(':')
var host = parts.shift()
var port = parts.shift()
var addr = new Address(host, port)
var client = redis.createClient(addr.port, addr.host, {})

describe('probes.redis', function () {
  var ctx = { redis: client }
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    ao.sampleRate = addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  var check = {
    'redis-entry': function (msg) {
      msg.should.have.property('Layer', 'redis')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('RemoteHost', addr.toString())
    },
    'redis-exit': function (msg) {
      msg.should.have.property('Layer', 'redis')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Test a simple res.end() call in an http server
  //
  it('should support single commands', function (done) {
    helper.test(emitter, helper.run(ctx, 'redis/set'), [
      function (msg) {
        check['redis-entry'](msg)
        msg.should.have.property('KVOp', 'set')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        msg.should.have.property('KVHit')
        check['redis-exit'](msg)
      }
    ], done)
  })

  //
  // Test a simple res.end() call in an http server
  //
  it('should support multi', function (done) {
    var steps = [
      function (msg) {
        check['redis-entry'](msg)
        msg.should.have.property('KVOp', 'multi')
      },
      function (msg) {
        check['redis-entry'](msg)
        msg.should.have.property('KVOp', 'set')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        check['redis-entry'](msg)
        msg.should.have.property('KVOp', 'get')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        check['redis-entry'](msg)
        msg.should.have.property('KVOp', 'exec')
      },
      function (msg) {
        check['redis-exit'](msg)
      },
      function (msg) {
        check['redis-exit'](msg)
      },
      function (msg) {
        check['redis-exit'](msg)
      },
      function (msg) {
        check['redis-exit'](msg)
      }
    ]

    helper.test(emitter, helper.run(ctx, 'redis/multi'), steps, done)
  })

  //
  // Test a simple res.end() call in an http server
  //
  it('should not interfere with pub/sub', function (done) {
    helper.test(emitter, helper.run(ctx, 'redis/pubsub'), [], done)
  })

})
