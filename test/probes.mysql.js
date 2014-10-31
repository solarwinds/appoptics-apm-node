// require('longjohn')

var debug = require('debug')('probes-mysql')
var helper = require('./helper')
var should = require('should')
var semver = require('semver')
var tv = global.tv = require('..')
var addon = tv.addon

var request = require('request')
var http = require('http')

var pkg = require('mysql/package.json')
var mysql = require('mysql')

describe('probes.mysql', function () {
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
      msg.should.have.property('RemoteHost', 'localhost:3306')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'mysql')
      msg.should.have.property('Label', 'exit')
    }
  }

  if (semver.satisfies(pkg.version, '>= 2.0.0')) {
    beforeEach(function (done) {
      db = ctx.mysql = mysql.createConnection({
        host: 'localhost',
        database: 'test',
        user: 'root'
      })

      // Set pool and pool cluster
      var poolConfig = {
        connectionLimit: 10,
        host: 'localhost',
        database: 'test',
        user: 'root'
      }

      pool = db.pool = mysql.createPool(poolConfig)
      cluster = db.cluster = mysql.createPoolCluster()
      cluster.add(poolConfig)

      // Connect
      db.connect(done)
    })
    afterEach(function (done) {
      db.end(done)
    })
  } else if (semver.satisfies(pkg.version, '>= 0.9.2')) {
    beforeEach(function () {
      db = ctx.mysql = mysql.createClient({
        host: 'localhost',
        database: 'test',
        user: 'root'
      })
    })
  } else {
    beforeEach(function (done) {
      db = ctx.mysql = new mysql.Client({
        host: 'localhost',
        database: 'test',
        user: 'root'
      })
      db.connect(done)
    })
  }

  it('should trace a basic query', test_basic)
  it('should trace a query with a value list', test_values)
  it('should trace a streaming query', test_stream)

  if (semver.satisfies(pkg.version, '>= 2.0.0')) {
    it('should trace a pooled query', test_pool)
    it('should trace a cluster pooled query', test_clustered_pool)
  } else {
    it.skip('should trace a pooled query', test_pool)
    it.skip('should trace a cluster pooled query', test_clustered_pool)
  }
  it('should sanitize a query', test_sanitize)

  function test_basic (done) {
    helper.httpTest(emitter, helper.run(ctx, 'mysql/basic'), [
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
    var last = tv.Layer.last
    if (last) {
      console.log('last is', last)
    }

    helper.httpTest(emitter, helper.run(ctx, 'mysql/values'), [
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

  function test_stream (done) {
    helper.httpTest(emitter, helper.run(ctx, 'mysql/stream'), [
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
    helper.httpTest(emitter, helper.run(ctx, 'mysql/pool'), [
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
    helper.httpTest(emitter, helper.run(ctx, 'mysql/pool-cluster'), [
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
    helper.httpTest(emitter, helper.run(ctx, 'mysql/sanitize'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * FROM test WHERE "foo" = \'?\'')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  }

})
