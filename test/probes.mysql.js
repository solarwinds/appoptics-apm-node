var debug = require('debug')('probes-mysql')
var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon

var request = require('request')
var http = require('http')

var mysql = require('mysql')

describe('probes.mysql', function () {
  var emitter
  var ctx = {}
  var pool
  var db

  //
  // Intercept tracelyzer messages for analysis
  //
  beforeEach(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  afterEach(function (done) {
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

  beforeEach(function (done) {
    db = ctx.mysql = mysql.createConnection({
      host: 'localhost',
      database: 'test',
      user: 'root'
    })
    pool = db.pool = mysql.createPool({
      connectionLimit: 10,
      host: 'localhost',
      database: 'test',
      user: 'root'
    })
    db.connect(done)
  })
  afterEach(function (done) {
    db.end(done)
  })

  it('should trace a basic query', function (done) {
    helper.httpTest(emitter, helper.run(ctx, 'mysql/basic'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should trace a query with a value list', function (done) {
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
  })

  it('should trace a streaming query', function (done) {
    helper.httpTest(emitter, helper.run(ctx, 'mysql/stream'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should trace a pooled query', function (done) {
    helper.httpTest(emitter, helper.run(ctx, 'mysql/pool'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT 1')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should sanitize a query', function (done) {
    helper.httpTest(emitter, helper.run(ctx, 'mysql/sanitize'), [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('Query', 'SELECT * FROM test WHERE "foo" = \'?\'')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

})
