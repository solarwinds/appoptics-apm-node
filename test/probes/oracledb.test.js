var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon

var log = ao.loggers

var should = require('should')

var oracledb
var pkg = {version: '0.0.0'}
try {
  oracledb = require('oracledb')
  pkg = require('oracledb/package')
} catch (e) {
  log.debug('cannot load oracledb', e)
}

var host = process.env.AO_TEST_ORACLE || 'oracle'
var database = process.env.AO_TEST_ORACLE_DBNAME || 'xe'
var config = {
  user: process.env.AO_TEST_ORACLE_USERNAME || 'system',
  password: process.env.AO_TEST_ORACLE_PASSWORD || 'oracle',
  connectString: host + '/' + database,
}

ao.debugLogging(true)

describe('probes.oracledb ' + pkg.version, function () {
  var emitter
  var ctx = {}
  var cluster
  var pool
  var db
  var realSampleTrace

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    realSampleTrace = ao.addon.Context.sampleTrace
    ao.addon.Context.sampleTrace = function () {
      return { sample: true, source: 6, rate: ao.sampleRate }
    }
  })
  after(function (done) {
    ao.addon.Context.sampleTrace = realSampleTrace
    emitter.close(done)
  })

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

  var checks = {
    'oracle-entry': function (msg) {
      msg.should.have.property('Layer', 'oracle')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', database)
      msg.should.have.property('Flavor', 'oracle')
      msg.should.have.property('RemoteHost', host)
    },
    'oracle-exit': function (msg) {
      msg.should.have.property('Layer', 'oracle')
      msg.should.have.property('Label', 'exit')
    }
  }

  if (oracledb && host && database && config.user && config.password) {
    it('should trace execute calls', test_basic)
    it('should trace execute calls in pool', test_pool)
    it('should include correct isAutoCommit value', test_commit)
  } else {
    var missing = {oracledb, host, database, user: config.user, password: config.password}
    for (var k in missing) {
      if (missing[k]) delete missing[k]
    }
    missing = Object.keys(missing)
    describe('skipping probes due to missing: ' + missing.join(', '), function() {
      it.skip('should trace execute calls', test_basic)
      it.skip('should trace execute calls in pool', test_pool)
      it.skip('should include correct isAutoCommit value', test_commit)
    })
  }

  function test_basic (done) {
    log.debug('asking helper to execute test_basic')
    helper.test(emitter, function (done) {
      function query (err, connection) {
        log.debug('test_basic query callback invoked')
        if (err) return done(err)
        connection.execute('SELECT 1 FROM DUAL', done)
      }
      log.debug('test_basic being executed')
      oracledb.getConnection(config, query)
      log.debug('done with test_basic oracledb.getConnection')
    }, [
      function (msg) {
        checks['oracle-entry'](msg)
        msg.should.have.property('Query', 'SELECT 1 FROM DUAL')
      },
      function (msg) {
        checks['oracle-exit'](msg)
      }
    ], done)
  }

  function test_pool (done) {
    helper.test(emitter, function (done) {
      function query (err, connection) {
        if (err) return done(err)
        connection.execute('SELECT 1 FROM DUAL', done)
      }

      oracledb.createPool(config, function (err, pool) {
        if (err) return done(err)
        pool.getConnection(query)
      })
    }, [
      function (msg) {
        checks['oracle-entry'](msg)
        msg.should.have.property('Query', 'SELECT 1 FROM DUAL')
      },
      function (msg) {
        checks['oracle-exit'](msg)
      }
    ], done)
  }

  function test_commit (done) {
    helper.test(emitter, function (done) {
      oracledb.isAutoCommit = false
      oracledb.getConnection(config, function (err, connection) {
        function query (isAutoCommit, done) {
          var options = {
            isAutoCommit: isAutoCommit
          }

          return function (err) {
            if (err) return done(err)
            connection.execute('SELECT 1 FROM DUAL', [], options, done)
          }
        }

        var fn = query(
          undefined,
          query(
            true,
            query(
              false,
              done
            )
          )
        )
        fn()
      })
    }, [
      function (msg) {
        checks['oracle-entry'](msg)
        msg.should.have.property('isAutoCommit', false)
      },
      function (msg) {
        checks['oracle-exit'](msg)
      },
      function (msg) {
        checks['oracle-entry'](msg)
        msg.should.have.property('isAutoCommit', true)
      },
      function (msg) {
        checks['oracle-exit'](msg)
      },
      function (msg) {
        checks['oracle-entry'](msg)
        msg.should.have.property('isAutoCommit', false)
      },
      function (msg) {
        checks['oracle-exit'](msg)
      }
    ], done)
  }

})
