var debug = require('debug')('probes-memcached')
var helper = require('./helper')
var should = require('should')
var semver = require('semver')
var tv = global.tv = require('..')
var addon = tv.addon

var Memcached = require('memcached')
var pkg = require('memcached/package.json')

describe('probes.memcached', function () {
  var emitter
  var ctx = {}
  var mem

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

  //
  // Create client instance
  //
  before(function () {
    mem = new Memcached('127.0.0.1:11211')
  })

  //
  // Define generic checks
  //
  var checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'memcached')
      msg.should.have.property('Label', 'entry')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'memcached')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Define tests
  //
  it('should add', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.add('foo', 'bar', 10, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'add')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  function test_touch (done) {
    helper.httpTest(emitter, function (done) {
      mem.touch('foo', 10, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'touch')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  if (semver.satisfies(pkg.version, '>= 0.2.2')) {
    it('should touch', test_touch)
  } else {
    it.skip('should touch', test_touch)
  }

  it('should get', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.get('foo', done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'get')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
        msg.should.have.property('KVHit', true)
      }
    ], done)
  })

  it('should getMulti', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.getMulti(['foo','bar'], done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'get')
        msg.should.have.property('KVKey', '["foo","bar"]')
      },
      function (msg) {
        checks.exit(msg)
        msg.should.have.property('KVKeyCount', 2)
        msg.should.have.property('KVHitCount', 1)
      }
    ], done)
  })

  it('should gets', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.gets('bar', done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'gets')
        msg.should.have.property('KVKey', 'bar')
      },
      function (msg) {
        checks.exit(msg)
        msg.should.have.property('KVHit', false)
      }
    ], done)
  })

  it('should append', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.append('foo', 'baz', done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'append')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should prepend', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.append('foo', 'baz', done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'append')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should set', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.set('foo', 'baz', 10, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'set')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should replace', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.replace('foo', 1, 10, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'replace')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should incr', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.incr('foo', 1, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'incr')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should decr', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.decr('foo', 1, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'decr')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should del', function (done) {
    helper.httpTest(emitter, function (done) {
      mem.del('foo', done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('KVOp', 'delete')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

})
