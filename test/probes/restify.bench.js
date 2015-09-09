// TODO: This benchmark is kind of terrible...figure out a better way to do it
var helper = require('../helper')
var tv = helper.tv
var Layer = tv.Layer

var semver = require('semver')
var http = require('http')

var restify
var pkg = require('restify/package.json')
if (semver.satisfies(process.version.slice(1), '> 0.8')) {
  restify = require('restify')
}

tracelyzer.setMaxListeners(Infinity)

suite('probes/restify', function () {
  var server
  var url

  before(function (done) {
    var app = restify.createServer(pkg)

    app.get('/', function (req, res) {
      res.end('ok')
    })

    server = app.listen(function () {
      var port = server.address().port
      url = 'http://localhost:' + port + '/hello/world'
      done()
    })
  })
  after(function (done) {
    server.close(done)
  })

  bench('dispatch', function (done) {
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
