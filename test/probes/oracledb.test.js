var tv = require('../..')
var addon = tv.addon

var helper = require('../helper')
var should = require('should')

var oracledb
try {
  oracledb = require('oracledb')
} catch (e) {}

var host = process.env.ORACLE_HOST
var database = process.env.ORACLE_DATABASE
var config = {
  connectString: host + '/' + database,
  password: process.env.ORACLE_PASS,
  user: process.env.ORACLE_USER
}

describe('probes.oracledb', function () {
  var emitter
  var ctx = {}
  var cluster
  var pool
  var db

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
    it.skip('should trace execute calls', test_basic)
    it.skip('should trace execute calls in pool', test_pool)
    it.skip('should include correct isAutoCommit value', test_commit)
  }

  function test_basic (done) {
    helper.httpTest(emitter, function (done) {
      function query (err, connection) {
        if (err) return done(err)
        connection.execute('SELECT 1 FROM DUAL', done)
      }

      oracledb.getConnection(config, query)
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
    helper.httpTest(emitter, function (done) {
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
    helper.httpTest(emitter, function (done) {
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
