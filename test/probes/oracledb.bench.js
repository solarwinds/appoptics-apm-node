var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var oracledb
try { oracledb = require('oracledb') }
catch (e) {}

tracelyzer.setMaxListeners(Infinity)

suite('probes/oracledb', function () {
  if ( ! oracledb) {
    before(function () {
      console.error('This node version is not supported by oracledb')
    })
    return
  }

  var host = process.env.ORACLE_HOST
  var database = process.env.ORACLE_DATABASE
  var config = {
    connectString: host + '/' + database,
    password: process.env.ORACLE_PASS,
    user: process.env.ORACLE_USER
  }

  var context = {}
  var db

  before(function (done) {
    oracledb.getConnection(config, function (err, conn) {
      db = conn
      done()
    })
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
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.execute('SELECT 1 FROM DUAL', done)
  })
})

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
