var debug = require('debug')('probes-pg')
var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon

var request = require('request')
var http = require('http')

var postgres = require('pg')
var conString = 'postgres://postgres@localhost/test'

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

  //
  // Yes, this is super janky. But necessary because switching to
  // the native driver is destructive to the pooling mechanism.
  //
  // The postgres.native property must NOT be accessed
  // until the before() step of that test collection.
  //
  var drivers = {
    javascript: function () { return postgres },
    native: function () { return postgres.native }
  }

  //
  // Test against both native and js postgres drivers
  //
  Object.keys(drivers).forEach(function (type) {
    var pg
    var db

    var checks = {
      entry: function (msg) {
        msg.should.have.property('Layer', 'postgres')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Database', 'test')
        msg.should.have.property('Flavor', 'postgresql')
        msg.should.have.property('RemoteHost', 'localhost:5432')
      },
      exit: function (msg) {
        msg.should.have.property('Layer', 'postgres')
        msg.should.have.property('Label', 'exit')
      }
    }

    describe(type, function () {
      before(function (done) {
        pg = drivers[type]()
        var client = new pg.Client(conString)
        client.connect(function (err) {
          if (err) return done(err)
          db = client
          done()
        })
      })

      it('should trace a basic query', function (done) {
        helper.httpTest(emitter, function (done) {
          db.query('SELECT $1::int AS number', ['1'], function (err) {
            db.end()
            done(err)
          })
        }, [
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
        helper.httpTest(emitter, function (done) {
          pg.connect(conString, function (err, client, free) {
            if (err) {
              free(err)
              done(err)
              return
            }

            client.query('SELECT $1::int AS number', ['1'], function (err) {
              free(err)
              done(err)
            })
          })
        }, [
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
        helper.httpTest(emitter, function (done) {
          pg.connect(conString, function (err, client, free) {
            if (err) {
              free(err)
              done(err)
              return
            }

            client.query({
              text: 'SELECT $1::int AS number',
              name: 'select n',
              values: ['1']
            }, function (err) {
              if (err) {
                free(err)
                done(err)
                return
              }

              client.query({
                name: 'select n',
                values: ['2']
              }, function (err) {
                free(err)
                done(err)
              })
            })
          })
        }, [
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
        tv.pg.sanitizeSql = true
        helper.httpTest(emitter, function (done) {
          pg.connect(conString, function (err, client, free) {
            if (err) {
              free(err)
              done(err)
              return
            }

            client.query('select * from "table" where "key" = \'value\'', function (err) {
              done()
            })
          })
        }, [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'select * from "table" where "key" = \'?\'')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], function (err) {
          tv.pg.sanitizeSql = false
          done(err)
        })
      })

      it('should trace evented style', function (done) {
        helper.httpTest(emitter, function (done) {
          pg.connect(conString, function (err, client, free) {
            if (err) {
              free(err)
              done(err)
              return
            }

            var q = client.query('select * from "table" where "foo" = \'bar\'')
            q.on('end', done.bind(null, null))
            q.on('error', function () {
              done()
            })
          })
        }, [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('Query', 'select * from "table" where "foo" = \'bar\'')
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })
    })
  })

})
