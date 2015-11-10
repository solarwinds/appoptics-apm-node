var helper = require('../helper')
var tv = helper.tv
var Layer = tv.Layer

var db_host = process.env.MYSQL_PORT_3306_TCP_ADDR || 'localhost'

var semver = require('semver')

var pkg = require('mysql/package.json')
var mysql = require('mysql')

tracelyzer.setMaxListeners(Infinity)

suite('probes/mysql', function () {
  var context = {}
  var cluster
  var pool
  var db

  // Ensure database/table existence
  before(function (done) {
    var db = makeDb({
      host: db_host,
      user: 'root'
    }, function () {
      db.query('CREATE DATABASE IF NOT EXISTS test;', function (err) {
        if (err) return done(err)
        db.end(done)
      })
    })
  })

  // Make connection
  before(function (done) {
    db = makeDb({
      host: db_host,
      database: 'test',
      user: 'root'
    }, function () {
      db.query('CREATE TABLE IF NOT EXISTS test (foo varchar(255));', done)
    })

    if (semver.satisfies(pkg.version, '>= 2.0.0')) {
      // Set pool and pool cluster
      var poolConfig = {
        connectionLimit: 10,
        host: db_host,
        database: 'test',
        user: 'root'
      }

      pool = mysql.createPool(poolConfig)
      cluster = mysql.createPoolCluster()
      cluster.add(poolConfig)
    }
  })

  if (semver.satisfies(pkg.version, '>= 2.6.0')) {
    after(function (done) {
      var fn = after(3, done)
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

  before(function () {
    tv.requestStore.enter(context)
    layer = new Layer('test', null, {})
    layer.enter()
  })
  after(function () {
    layer.exit()
    tv.requestStore.exit(context)
  })

  bench('query', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.query('SELECT 1', function () {})
  })

  bench('object query', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.query('INSERT INTO test SET ?', {foo: 'bar'}, function () {})
  })

  bench('pool', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    pool.query('SELECT 1', function () {})
  })

  bench('cluster', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    cluster.getConnection(function (err, connection) {
      if (err) return complete(err)
      connection.query('SELECT 1', complete)
      function complete (err, res) {
        connection.release()
      }
    })
  })

  bench('stream', function (done) {
    var cb = after(3, done)
    multi_on(tracelyzer, 2, 'message', cb)
    db.query('SELECT 1')
      .on('error', cb)
      .on('end', cb)
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
