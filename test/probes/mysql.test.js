/* global it, describe, before, beforeEach, after, afterEach */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common.js')

const mysql = require('mysql')
const pkg = require('mysql/package.json')

const semver = require('semver')

const addr = helper.Address.from(process.env.SW_APM_TEST_MYSQL || 'mysql:3306')[0]
const user = process.env.SW_APM_TEST_MYSQL_USERNAME || 'root'
const pass = process.env.SW_APM_TEST_MYSQL_PASSWORD || 'admin'

let dbExists = false

describe(`probes.mysql ${pkg.version}`, function () {
  this.timeout(10000)
  const ctx = {
    // set AO_IX in matrix containers to avoid multi-access conflicts. Use it
    // to construct a unique table name for each container executing in parallel.
    t: 'test' + (process.env.AO_IX || '')
  }
  let emitter
  let cluster
  let pool
  let db

  //
  beforeEach(function (done) {
    setTimeout(function () {
      done()
    }, 100)
    ao.g.testing(__filename)
  })

  //
  // Intercept messages for analysis
  //
  before(function (done) {
    emitter = helper.backend(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.probes.fs.enabled = false
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
  })

  let prevll
  beforeEach(function () {
    if (this.currentTest.title === 'should trace a streaming query') {
      prevll = ao.logLevel
    }
  })

  afterEach(function () {
    if (this.currentTest.title === 'should trace a streaming query') {
      ao.logLevel = prevll
    }
  })

  const checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'mysql')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', 'test')
      msg.should.have.property('Flavor', 'mysql')
      msg.should.have.property('RemoteHost')
      msg.RemoteHost.should.be.oneOf(addr.toString(), '127.0.0.1:3306', 'localhost:3306')
    },
    error: function (msg) {
      msg.should.have.property('Label', 'error')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'mysql')
      msg.should.have.property('Label', 'exit')
    }
  }

  function makeDb (conf, done) {
    const db = mysql.createConnection(conf)
    db.connect(done)

    return db
  }

  if (semver.satisfies(pkg.version, '>= 2.6.0')) {
    after(function (done) {
      const fn = helper.after(3, done)
      cluster.end(fn)
      pool.end(fn)
      db.end(fn)
    })
  } else if (semver.satisfies(pkg.version, '>= 2.0.0')) {
    after(function (done) {
      cluster.end()
      pool.end()
      db.end(done)
    })
  }

  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', helper.noop)
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should see if a database exists', function (done) {
    const db = makeDb({
      host: addr.host,
      port: addr.port,
      user: user,
      password: pass
    }, function (err) {
      if (err) {
        return done(err)
      }
      // db.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = \'test\';', function (err, data) {
      db.query('show databases like \'test\';', function (err, data) {
        if (err) {
          ao.loggers.debug(err)
          return done(err)
        }
        if (data.length) {
          dbExists = true
        }
        db.end(done)
      })
    })
  })

  it('should create a database if it doesn\'t exist', function (done) {
    if (dbExists) {
      done()
      return
    }

    const db = makeDb({
      host: addr.host,
      port: addr.port,
      user: user,
      password: pass
    }, function (err) {
      if (err) return done(err)
      db.query('CREATE DATABASE IF NOT EXISTS test;', function (err) {
        if (err) return done(err)
        db.end(done)
      })
    })
  })

  it('should create a table if it doesn\'t exist', function (done) {
    db = ctx.mysql = makeDb({
      host: addr.host,
      port: addr.port,
      database: 'test',
      user: user,
      password: pass
    }, function (err) {
      if (err) return done(err)
      db.query(`CREATE TABLE IF NOT EXISTS ${ctx.t} (foo varchar(255));`, done)
    })
  })

  it('should create a pool and pool cluster', function () {
    const poolConfig = {
      connectionLimit: 10,
      host: addr.host,
      port: addr.port,
      database: 'test',
      user: user,
      password: pass
    }

    pool = db.pool = mysql.createPool(poolConfig)
    cluster = db.cluster = mysql.createPoolCluster()
    cluster.add(poolConfig)
  })

  it('should be configured to sanitize SQL by default', function () {
    ao.probes.mysql.should.have.property('sanitizeSql', true)
    // turn off for testing
    ao.probes.mysql.sanitizeSql = false
  })

  it('should be configured to not tag SQL by default', function () {
    ao.probes.mysql.should.have.property('tagSql', false)
  })

  it('should trace a basic query', test_basic)
  it('should trace a query with a value list', test_values)
  it('should trace a query with a value object', test_object)
  it('should trace a streaming query', test_stream)
  it('should trace a pooled query', test_pool)
  it('should trace a cluster pooled query', test_clustered_pool)
  it('should sanitize a query', test_sanitize)
  it('should truncate long queries', test_long_query)
  it('should tag queries when feature is enabled', test_tag)
  it('should skip when disabled', test_disabled)

  //
  // tests
  //
  function test_basic (done) {
    helper.test(emitter, function (done) {
      const query = 'SELECT 1'
      ctx.mysql.query(query, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
        msg.should.not.have.property('QueryTag')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_values (done) {
    helper.test(emitter, function (done) {
      const query = 'SELECT ?'
      const values = ['1']
      ctx.mysql.query(query, values, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT ?')
        msg.should.have.property('QueryArgs', '["1"]')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_object (done) {
    helper.test(emitter, function (done) {
      const query = `INSERT INTO ${ctx.t} SET ?`
      const obj = { foo: 'bar' }
      ctx.mysql.query(query, obj, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', `INSERT INTO ${ctx.t} SET ?`)
        msg.should.have.property('QueryArgs', '{"foo":"bar"}')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_stream (done) {
    helper.test(emitter, function (done) {
      const query = 'SELECT 1'
      const q = ctx.mysql.query(query)
      q
        .on('error', done)
        .on('result', function (row) {
          // Do nothing
        })
        .on('end', function () {
          done()
        })
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_pool (done) {
    helper.test(emitter, function () {
      const query = 'SELECT 1'
      ctx.mysql.pool.query(query, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_clustered_pool (done) {
    helper.test(emitter, function () {
      const query = 'SELECT 1'
      ctx.mysql.cluster.getConnection(function (err, connection) {
        function complete (err, res) {
          if (typeof connection !== 'undefined') {
            connection.release()
          }
          done(err, res)
        }

        if (err) {
          complete(err)
          return
        }

        connection.query(query, complete)
      })
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_sanitize (done) {
    helper.test(emitter, function (done) {
      ao.probes.mysql.sanitizeSql = true
      const query = `SELECT * FROM ${ctx.t} WHERE "foo" = ` + mysql.escape('bar')
      ctx.mysql.query(query, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', `SELECT * FROM ${ctx.t} WHERE "foo" = ?`)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], () => {
      ao.probes.mysql.sanitizeSql = false
      done()
    })
  }

  function test_long_query (done) {
    helper.test(emitter, function (done) {
      let query = 'SELECT '
      for (let i = 0; i < 3000; i++) {
        query += '1'
      }
      ctx.mysql.query(query, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query')
        msg.Query.length.should.not.be.above(2048)
      },
      function (msg) {
        checks.exit(msg)
      }
    ], function (err) {
      done(err)
    })
  }

  function test_tag (done) {
    ao.probes.mysql.tagSql = true
    helper.test(emitter, function (done) {
      const query = 'SELECT 1'
      ctx.mysql.query(query, done)
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('QueryTag', `/*traceparent='${msg['sw.trace_context']}'*/`)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], () => {
      ao.probes.mysql.tagSql = false
      done()
    })
  }

  function test_disabled (done) {
    ao.probes.mysql.enabled = false
    helper.test(emitter, function (done) {
      const query = 'SELECT 1'
      ctx.mysql.query(query, done)
    }, [], function (err) {
      ao.probes.mysql.enabled = true
      done(err)
    })
  }
})
