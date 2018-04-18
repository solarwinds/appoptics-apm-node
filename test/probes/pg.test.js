var extend = require('util')._extend
var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon
var conf = ao.probes.pg

var should = require('should')

var http = require('http')
var postgres = require('pg')
var pkg = require('pg/package')

var env = process.env
var addr = helper.Address.from(env.AO_TEST_POSTGRES || 'postgres:5432')[0]
// using a null password is valid.
var password = 'AO_TEST_POSTGRES_PASSWORD' in env
  ? env.AO_TEST_POSTGRES_PASSWORD
  : (env.DATABASE_POSTGRESQL_PASSWORD || 'xyzzy')
var auth = {
  host: addr.host,
  port: addr.port,
  user: env.AO_TEST_POSTGRES_USER || env.DATABASE_POSTGRESQL_USERNAME || 'postgres',
  password: password,
  database: 'test'
}

console.log(`using password "${password}" for user "${auth.user}"`)

var stream = require('stream')
var canNative = typeof stream.Duplex !== 'undefined'

if (canNative) {
  try {
    require('pg/lib/native')
  } catch (e) {
    canNative = false
  }
}

describe('probes.postgres ' + pkg.version, function () {
  var emitter
  var realSampleTrace

  it('should sanitize SQL by default', function () {
    conf.should.have.property('sanitizeSql', true)
    conf.sanitizeSql = false
  })

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
    ao.probes.fs.enabled = false
    realSampleTrace = ao.addon.Context.sampleTrace
    ao.addon.Context.sampleTrace = function () {
      return { sample: true, source: 6, rate: ao.sampleRate }
    }
  })
  after(function (done) {
    ao.addon.Context.sampleTrace = realSampleTrace
    ao.probes.fs.enabled = true
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

      after(function () {
        db.end()
      })

      // fake test to work around UDP dropped message issue
      it('UDP might lose a message', function (done) {
        helper.test(emitter, function (done) {
          ao.instrument('fake', ao.noop)
          done()
        }, [
            function (msg) {
              msg.should.have.property('Label').oneOf('entry', 'exit'),
                msg.should.have.property('Layer', 'fake')
            }
          ], done)
      })

      it('should trace a basic query', function (done) {
        helper.test(emitter, helper.run(ctx, 'pg/basic'), [
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
        helper.test(emitter, helper.run(ctx, 'pg/pool'), [
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
        helper.test(emitter, helper.run(ctx, 'pg/prepared'), [
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
        helper.test(emitter, helper.run(ctx, 'pg/sanitize'), [
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
        helper.test(emitter, helper.run(ctx, 'pg/evented'), [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'select * from "test" where "foo" = \'bar\'')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })

      it('should trim long queries', function (done) {
        helper.test(emitter, function (done) {
          var nums = []
          for (var i = 0; i < 1000; i++) {
            nums.push('1::int AS number')
          }
          var query = 'SELECT ' + nums.join(', ')
          db.query(query, function (err) {
            done(err)
          })
        }, [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query')
            msg.Query.length.should.not.be.above(2048)
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })

      it('should skip when disabled', function (done) {
        ao.probes.pg.enabled = false
        helper.test(emitter, helper.run(ctx, 'pg/basic'), [], function (err) {
          ao.probes.pg.enabled = true
          done(err)
        })
      })
    }
  })

})
