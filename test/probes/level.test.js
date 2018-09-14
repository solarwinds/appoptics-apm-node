'use strict'

const helper = require('../helper')
const ao = helper.ao

// NOTE: requiring leveldown is necessary as the one that works with
// node 0.11 does not match the one in the devDependencies of levelup.
const level = require('level')
const db = level('../test-db')

const pkg = require('level/package')

describe('probes.level ' + pkg.version, function () {
  let emitter

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  const check = {
    'levelup-entry': function (msg) {
      msg.should.have.property('Layer', 'levelup')
      msg.should.have.property('Label', 'entry')
    },
    'levelup-exit': function (msg) {
      msg.should.have.property('Layer', 'levelup')
      msg.should.have.property('Label', 'exit')
    }
  }

  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit'),
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should support put', function (done) {
    helper.test(emitter, function (done) {
      db.put('foo', 'bar', done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'put')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support get', function (done) {
    helper.test(emitter, function (done) {
      db.get('foo', done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'get')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        msg.should.have.property('KVHit')
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support del', function (done) {
    helper.test(emitter, function (done) {
      db.del('foo', done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'del')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support array batch', function (done) {
    helper.test(emitter, function (done) {
      db.batch([
        {type: 'put', key: 'foo', value: 'bar'},
        {type: 'del', key: 'foo'},
      ], done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'batch')
        msg.should.have.property('KVKeys', '["foo","foo"]')
        msg.should.have.property('KVOps', '["put","del"]')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support chained batch', function (done) {
    helper.test(emitter, function (done) {
      db.batch()
        .put('foo', 'bar')
        .del('foo')
        .write(done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'batch')
        msg.should.have.property('KVKeys', '["foo","foo"]')
        msg.should.have.property('KVOps', '["put","del"]')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })
})
