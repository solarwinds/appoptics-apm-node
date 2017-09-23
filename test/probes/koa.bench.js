// TODO: This benchmark is kind of terrible...figure out a better way to do it
var helper = require('../helper')
var ao = helper.ao
var Layer = ao.Layer

var http = require('http')

tracelyzer.setMaxListeners(Infinity)

suite('probes/express', function () {
  var server
  var url

  if ( ! canGenerator()) {
    before(function () {
      console.error('This node version does not support koa')
    })
    return
  }

  before(function (done) {
    var koa = require('koa')
    var _ = require('koa-route')
    var app = koa()

    // Yes, this is gross, but the eval is required so the entire file
    // doesn't throw a syntax error on old node versions.
    app.use(_.get('/hello/:name', toGenerator(function (name) {
      this.body = 'Hello, ' + name + '!'
    })))

    server = http.createServer(app.callback())
    server.listen(function () {
      var port = server.address().port
      url = 'http://localhost:' + port + '/hello/world'
      done()
    })
  })
  after(function (done) {
    server.close(done)
  })

  bench('dispatch', function (done) {
    multi_on(tracelyzer, 6, 'message', after(6, done))
    http.get(url, function (res) { res.resume() })
  })
})

function canGenerator () {
  try {
    eval('function* foo () {}')
    return true
  } catch (e) {
    return false
  }
}

function toGenerator (fn) {
  eval(fn.toString().replace(/^function/, 'function* generator'))
  return generator
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
