// TODO: This benchmark is kind of terrible...figure out a better way to do it
var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var http = require('http')

tracelyzer.setMaxListeners(Infinity)

suite('probes/http - server', function () {
  var url
  var server = http.createServer(function (req, res) {
    res.end('done')
  })

  before(function (done) {
    server.listen(done)
  })
  before(function () {
    url = 'http://localhost:' + server.address().port
  })
  after(function (done) {
    server.close(done)
  })

  bench('connection', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    http.get(url, function (res) { res.resume() })
  })
})

suite('probes/http - client', function () {
  var context = {}
  var span
  var url

  var server = http.createServer(function (req, res) {
    res.end('done')
  })

  before(function (done) {
    server.listen(done)
  })
  before(function () {
    url = 'http://localhost:' + server.address().port
  })
  after(function (done) {
    server.close(done)
  })

  before(function (done) {
    tracelyzer.once('message', done.bind(null, null))
    ao.requestStore.enter(context)
    span = new Span('test', null, {})
    span.enter()
  })
  after(function () {
    span.exit()
    ao.requestStore.exit(context)
  })

  bench('connection', function (done) {
    multi_on(tracelyzer, 4, 'message', after(4, done))
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
