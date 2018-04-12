// TODO: This benchmark is kind of terrible...figure out a better way to do it
var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var director = require('director')
var http = require('http')

tracelyzer.setMaxListeners(Infinity)

suite('probes/director', function () {
  var server
  var url

  before(function (done) {
    function hello (name) {
      this.res.writeHead(200, { 'Content-Type': 'text/plain' })
      this.res.end('Hello, ' + name + '!')
    }

    var router = new director.http.Router({
      '/hello/:name': { get: hello }
    })

    var server = http.createServer(function (req, res) {
      router.dispatch(req, res, function () {})
    })

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
