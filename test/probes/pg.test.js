var extend = require('util')._extend
var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')

var request = require('request')
var http = require('http')

var postgres = require('pg')
var addr = helper.Address.from(process.env.TEST_POSTGRES || 'localhost:5432')[0]
var auth = {
  host: addr.host,
  port: addr.port,
  user: process.env.TEST_POSTGRES_USERNAME || 'postgres',
  password: process.env.TEST_POSTGRES_PASSWORD,
  database: 'test'
}

var stream = require('stream')
var canNative = typeof stream.Duplex !== 'undefined'

if (canNative) {
  try {
    require('pg/lib/native')
  } catch (e) {
    canNative = false
  }
}

describe('probes.postgres', function () {
  var emitter
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

  before(function (done) {
    this.timeout(10000)
    var tmpAuth = extend(extend({}, auth), { database: 'postgres' })
    var client = new postgres.Client(tmpAuth)
    client.connect(function (err) {
      if (err) return done(err)
      client.query('create database test;', function () {
        client.end()
        done()
      })
    })
  })

  //
  // Yes, this is super janky. But necessary because switching to
  // the native driver is destructive to the pooling mechanism.
  //
  // The postgres.native property must NOT be accessed
  // until the before() step of that test collection.
  //
  var drivers = {
    javascript: {
      skip: false,
      get: function () {
        return postgres
      }
    },
    native: {
      // Only test the native driver when Duplex streams are available,
      // otherwise node 0.8 will crash while trying to load pg-native
      skip: ! canNative,
      get: function () {
        return postgres.native
      }
    }
  }

  //
  // Test against both native and js postgres drivers
  //
  Object.keys(drivers).forEach(function (type) {
    var ctx = {}
    var pg
    var db

    var checks = {
      entry: function (msg) {
        msg.should.have.property('Layer', 'postgres')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Database', 'test')
        msg.should.have.property('Flavor', 'postgresql')
        msg.should.have.property('RemoteHost', addr.toString())
      },
      exit: function (msg) {
        msg.should.have.property('Layer', 'postgres')
        msg.should.have.property('Label', 'exit')
      }
    }

    var driver = drivers[type]
    if (driver.skip) {
      describe.skip(type, test)
    } else {
      describe(type, test)
    }

    function test () {
      before(function (done) {
        this.timeout(10000)
        ctx.pg = pg = driver.get()
        pg.address = auth
        var client = new pg.Client(auth)
        client.connect(function (err) {
          if (err) return done(err)
          pg.db = db = client
          ctx.pg = pg
          done()
        })
      })

      before(function (done) {
        pg.db.query('CREATE TABLE IF NOT EXISTS test (foo TEXT)', done)
      })

      it('should trace a basic query', function (done) {
        helper.httpTest(emitter, helper.run(ctx, 'pg/basic'), [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'SELECT $1::int AS number')
            msg.should.have.property('QueryArgs', '["1"]')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })

      it('should trace through a connection pool', function (done) {
        helper.httpTest(emitter, helper.run(ctx, 'pg/pool'), [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'SELECT $1::int AS number')
            msg.should.have.property('QueryArgs', '["1"]')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })

      it('should trace prepared statements', function (done) {
        helper.httpTest(emitter, helper.run(ctx, 'pg/prepared'), [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'SELECT $1::int AS number')
            msg.should.have.property('QueryArgs', '["1"]')
          },
          function (msg) {
            checks.exit(msg)
          },
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'SELECT $1::int AS number')
            msg.should.have.property('QueryArgs', '["2"]')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })

      it('should sanitize query string, when not using value list', function (done) {
        helper.httpTest(emitter, helper.run(ctx, 'pg/sanitize'), [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'select * from "test" where "key" = \'?\'')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })

      it('should trace evented style', function (done) {
        helper.httpTest(emitter, helper.run(ctx, 'pg/evented'), [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'select * from "test" where "foo" = \'bar\'')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })
    }
  })

})
