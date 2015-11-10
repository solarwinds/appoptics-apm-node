var helper = require('../helper')
var Address = helper.Address
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var semver = require('semver')

var request = require('request')
var http = require('http')

var pkg = require('mysql/package.json')
var mysql = require('mysql')

var addr = Address.from(process.env.TEST_MYSQL || 'localhost:3306')[0]
var soon = global.setImmediate || process.nextTick

describe('probes.mysql', function () {
  this.timeout(10000)
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

  var checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'mysql')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', 'test')
      msg.should.have.property('Flavor', 'mysql')
      msg.should.have.property('RemoteHost', addr.toString())
    },
    info: function (msg) {
      msg.should.have.property('Label', 'info')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'mysql')
      msg.should.have.property('Label', 'exit')
    }
  }

  function makeDb (conf, done) {
    var db
    if (semver.satisfies(pkg.version, '>= 2.0.0')) {
      db = mysql.createConnection(conf)
      db.connect(done)
    } else if (semver.satisfies(pkg.version, '>= 0.9.2')) {
      db = mysql.createClient(conf)
      soon(done)
    } else {
      db = new mysql.Client(conf)
      db.connect(done)
    }

    return db
  }

  // Ensure database/table existence
  beforeEach(function (done) {
    var db = makeDb({
      host: addr.host,
      port: addr.port,
      user: process.env.TEST_MYSQL_USERNAME || 'root',
      password: process.env.TEST_MYSQL_PASSWORD
    }, function (err) {
      if (err) return done(err)
      db.query('CREATE DATABASE IF NOT EXISTS test;', function (err) {
        if (err) return done(err)
        db.end(done)
      })
    })
  })

  // Make connection
  beforeEach(function (done) {
    db = ctx.mysql = makeDb({
      host: addr.host,
      port: addr.port,
      database: 'test',
      user: process.env.TEST_MYSQL_USERNAME || 'root',
      password: process.env.TEST_MYSQL_PASSWORD
    }, function (err) {
      if (err) return done(err)
      db.query('CREATE TABLE IF NOT EXISTS test (foo varchar(255));', done)
    })

    if (semver.satisfies(pkg.version, '>= 2.0.0')) {
      // Set pool and pool cluster
      var poolConfig = {
        connectionLimit: 10,
        host: addr.host,
        port: addr.port,
        database: 'test',
        user: process.env.TEST_MYSQL_USERNAME || 'root',
        password: process.env.TEST_MYSQL_PASSWORD
      }

      pool = db.pool = mysql.createPool(poolConfig)
      cluster = db.cluster = mysql.createPoolCluster()
      cluster.add(poolConfig)
    }
  })

  if (semver.satisfies(pkg.version, '>= 2.6.0')) {
    afterEach(function (done) {
      var fn = helper.after(3, done)
      cluster.end(fn)
      pool.end(fn)
      db.end(fn)
    })
  } else if (semver.satisfies(pkg.version, '>= 2.0.0')) {
    afterEach(function (done) {
      cluster.end()
      pool.end()
      db.end(done)
    })
  }

  it('should trace a basic query', test_basic)
  it('should trace a query with a value list', test_values)
  if (semver.satisfies(pkg.version, '>= 1.0.0')) {
    it('should trace a query with a value object', test_object)
  } else {
    it.skip('should trace a query with a value object', test_object)
  }
  it('should trace a streaming query', test_stream)

  if (semver.satisfies(pkg.version, '>= 2.0.0')) {
    it('should trace a pooled query', test_pool)
    it('should trace a cluster pooled query', test_clustered_pool)
  } else {
    it.skip('should trace a pooled query', test_pool)
    it.skip('should trace a cluster pooled query', test_clustered_pool)
  }
  it('should sanitize a query', test_sanitize)
  it('should report caller errors', test_caller_error)
  it('should trim long queries', test_long_query)
  it('should skip when disabled', test_disabled)

  function test_basic (done) {
    helper.test(emitter, helper.run(ctx, 'mysql/basic'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_values (done) {
    helper.test(emitter, helper.run(ctx, 'mysql/values'), [
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
    helper.test(emitter, helper.run(ctx, 'mysql/object'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'INSERT INTO test SET ?')
        msg.should.have.property('QueryArgs', '{"foo":"bar"}')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_stream (done) {
    helper.test(emitter, helper.run(ctx, 'mysql/stream'), [
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
    helper.test(emitter, helper.run(ctx, 'mysql/pool'), [
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
    helper.test(emitter, helper.run(ctx, 'mysql/pool-cluster'), [
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
    helper.test(emitter, helper.run(ctx, 'mysql/sanitize'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * FROM test WHERE "foo" = \'?\'')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

  function test_caller_error (done) {
    var error
    helper.test(emitter, function (done) {
      try {
        ctx.mysql.query('SELECT ?', [function () {}], function () {})
      } catch (err) {
        error = err
        done()
      }
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT ?')
      },
      function (msg) {
        checks.info(msg)
        msg.should.have.property('ErrorClass', error.constructor.name)
        msg.should.have.property('Backtrace', error.stack)
        msg.should.have.property('ErrorMsg', error.message)
      }
    ], done)
  }

  function test_long_query (done) {
    helper.test(emitter, function (done) {
      var query = 'SELECT '
      for (var i = 0; i < 3000; i++) {
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

  function test_disabled (done) {
    tv.mysql.enabled = false
    helper.test(emitter, helper.run(ctx, 'mysql/basic'), [], function (err) {
      tv.mysql.enabled = true
      done(err)
    })
  }

})
