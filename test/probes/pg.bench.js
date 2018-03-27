var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var postgres = require('pg')
var db_host = process.env.POSTGRES_PORT_5432_TCP_ADDR || 'localhost'
var conString = 'postgres://postgres@' + db_host + '/test'

var stream = require('stream')
var canNative = typeof stream.Duplex !== 'undefined'

if (canNative) {
  try {
    require('pg/lib/native')
  } catch (e) {
    canNative = false
  }
}

tracelyzer.setMaxListeners(Infinity)


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
  suite('probes/pg - ' + type, function () {
    var context = {}
    var client

    var driver = drivers[type]
    if (driver.skip) {
      before(function () {
        console.error('Can not use ' + type + ' version of pg')
      })
      return
    }

    // Ensure database/table existence
    before(function (done) {
      var client = new postgres.Client({
        database: 'postgres',
        user: 'postgres'
      })
      client.connect(function (err) {
        if (err) return done(err)
        client.query('create database test;', function () {
          done()
        })
      })
    })
    before(function (done) {
      var pg = driver.get()
      client = new pg.Client(conString)
      client.connect(done)
    })
    before(function (done) {
      client.query('CREATE TABLE IF NOT EXISTS test (foo TEXT)', done)
    })
    after(function () {
      client.end()
    })

    before(function () {
      ao.requestStore.enter(context)
      span = new Span('test', null, {})
      span.enter()
    })
    after(function () {
      span.exit()
      ao.requestStore.exit(context)
    })

    bench('query', function (done) {
      var cb = after(3, done)
      multi_on(tracelyzer, 2, 'message', cb)
      client.query('SELECT $1::int AS number', ['1'], cb)
    })

    bench('stream', function (done) {
      var cb = after(3, done)
      multi_on(tracelyzer, 2, 'message', cb)

      client.query('select * from "test" where "foo" = \'bar\'')
        .on('error', cb)
        .on('end', cb)
    })
  })
})

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

function after (n, cb) {
  return function () {
    --n || cb()
  }
}

function multi_on (em, n, ev, cb) {
  function step () {
    if (n-- > 0) em.once(ev, function () {
      cb.apply(this, arguments)
      step()
    })
  }
  step()
}
