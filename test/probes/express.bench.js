// TODO: This benchmark is kind of terrible...figure out a better way to do it
var helper = require('../helper')
var tv = helper.tv
var Layer = tv.Layer

var express = require('express')
var http = require('http')

tracelyzer.setMaxListeners(Infinity)

suite('probes/express', function () {
  var server
  var url

  before(function (done) {
    var app = express()

    app.get('/hello/:name', function (req, res) {
      res.end('Hello, ' + req.params.name + '!')
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
