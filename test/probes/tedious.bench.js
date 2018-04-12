var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var pkg = require('tedious/package.json')
var tedious = require('tedious')
var Connection = tedious.Connection
var Request = tedious.Request
var TYPES = tedious.TYPES

// Found some free host.
var host = 'appoptics-test.mssql.somee.com'
var user = 'sbelanger_SQLLogin_1'
var pass = 'a8glrk5vss'

tracelyzer.setMaxListeners(Infinity)

suite('probes/tedious', function () {
  var context = {}
  var client

  before(function () {
    console.error('I need to find a new MSSQL test DB...')
  })
  return

  before(function (done) {
    client = new Connection({
        userName: user,
        password: pass,
        server: host,
        options: {
          database: 'test',
          tdsVersion: '7_1'
        }
    })
    client.on('connect', done)
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
    client.execSql(new Request("select 42, 'hello world'", cb))
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
