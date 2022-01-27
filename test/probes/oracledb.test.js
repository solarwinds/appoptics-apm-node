/* global it, describe, before, after, afterEach */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common')

const oracledb = require('oracledb')
const pkg = require('oracledb/package.json')

const addr = process.env.AO_TEST_ORACLE || 'oracle:1521'

// IMPORTANT: those are "hard set" for the test image
const database = 'xe'
const config = {
  user: 'system',
  password: 'topsecret',
  connectString: addr + '/' + database
}

describe(`probes.oracledb ${pkg.version}`, function () {
  let emitter
  let lastConnection

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'

    ao.g.testing(__filename)
  })
  after(function (done) {
    emitter.close(done)
  })

  afterEach(function () {
    if (!lastConnection) {
      return Promise.resolve()
    }
    return lastConnection.close()
  })

  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should be configured to sanitize SQL by default', function () {
    ao.probes.oracledb.should.have.property('sanitizeSql', true)
    ao.probes.oracledb.sanitizeSql = false
  })

  const checks = {
    'oracle-entry': function (msg) {
      msg.should.have.property('Layer', 'oracle')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', database)
      msg.should.have.property('Flavor', 'oracle')
      msg.should.have.property('RemoteHost', addr)
    },
    'oracle-exit': function (msg) {
      msg.should.have.property('Layer', 'oracle')
      msg.should.have.property('Label', 'exit')
    }
  }

  it('should trace execute calls', test_basic)
  it('should sanitize query', test_sanitization)
  it('should truncate long queries', test_truncate)
  it('should trace execute calls in pool', test_pool)
  it('should include correct isAutoCommit value', test_commit)
  it('should do nothing when disabled', test_disabled)

  function test_basic (done) {
    helper.test(emitter, function (done) {
      oracledb.isAutoCommit = false
      function query (err, connection) {
        if (err) {
          return done(err)
        }
        lastConnection = connection
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

  function test_sanitization (done) {
    helper.test(emitter, function (done) {
      oracledb.isAutoCommit = false
      ao.probes.oracledb.sanitizeSql = true

      function query (err, connection) {
        if (err) {
          return done(err)
        }
        lastConnection = connection
        connection.execute('SELECT 42 FROM DUAL', done)
      }
      oracledb.getConnection(config, query)
    }, [
      function (msg) {
        checks['oracle-entry'](msg)
        msg.should.have.property('Query', 'SELECT 0 FROM DUAL')
        msg.should.not.have.property('QueryArgs')
      },
      function (msg) {
        checks['oracle-exit'](msg)
      }
    ], () => {
      ao.probes.oracledb.sanitizeSql = false
      done()
    })
  }

  function test_truncate (done) {
    let longQuery = []
    for (let i = 0; i < 3000; i++) {
      longQuery.push(`${i}`)
    }
    longQuery = 'SELECT ' + longQuery.join(', ') + ' FROM DUAL'

    helper.test(emitter, function (done) {
      oracledb.isAutoCommit = false
      function query (err, connection) {
        if (err) {
          return done(err)
        }
        lastConnection = connection
        connection.execute(longQuery, done)
      }
      oracledb.getConnection(config, query)
    }, [
      function (msg) {
        checks['oracle-entry'](msg)
        msg.Query.length.should.not.be.above(2048)
      },
      function (msg) {
        checks['oracle-exit'](msg)
      }
    ], done)
  }

  function test_pool (done) {
    helper.test(emitter, function (done) {
      oracledb.isAutoCommit = false
      function query (err, connection) {
        if (err) return done(err)
        lastConnection = connection
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
          const options = {
            isAutoCommit: isAutoCommit
          }

          return function (err) {
            if (err) return done(err)
            lastConnection = connection
            connection.execute('SELECT 1 FROM DUAL', [], options, done)
          }
        }

        const fn = query(
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

  function test_disabled (done) {
    ao.probes.oracledb.enabled = false

    helper.test(emitter, function (done) {
      oracledb.isAutoCommit = false
      function query (err, connection) {
        if (err) {
          return done(err)
        }
        lastConnection = connection
        connection.execute('SELECT 1 FROM DUAL', done)
      }
      oracledb.getConnection(config, query)
    }, [
      function (msg) {
        // the msg is from the exit of the last span not from the the probe which is disabled.
        msg.should.not.have.property('Query')
        msg.should.have.property('Layer', 'outer')
        done()
      }
    ], done)
  }
})
