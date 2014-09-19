var debug = require('debug')('probes-redis')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var request = require('request')
var http = require('http')

var redis = require('redis')
var client = redis.createClient()

describe('probes.redis', function () {
  var ctx = { redis: client }
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

  var check = {
    'redis-exit': function (msg) {
      msg.should.have.property('Layer', 'redis')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Test a simple res.end() call in an http server
  //
  it('should support single commands', function (done) {
    helper.httpTest(emitter, helper.run(ctx, 'redis/set'), [
      function (msg) {
        msg.should.have.property('Layer', 'redis')
        msg.should.have.property('Label', 'entry')
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
        msg.should.have.property('Layer', 'redis')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('KVOp', 'multi')
      },
      function (msg) {
        msg.should.have.property('Layer', 'redis')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('KVOp', 'set')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        msg.should.have.property('Layer', 'redis')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('KVOp', 'get')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        msg.should.have.property('Layer', 'redis')
        msg.should.have.property('Label', 'entry')
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

    helper.httpTest(emitter, helper.run(ctx, 'redis/multi'), steps, done)
  })

  //
  // Test a simple res.end() call in an http server
  //
  it('should not interfere with pub/sub', function (done) {
    helper.httpTest(emitter, helper.run(ctx, 'redis/pubsub'), [], done)
  })

})
