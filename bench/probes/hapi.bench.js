// TODO: This benchmark is kind of terrible...figure out a better way to do it
var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var semver = require('semver')
var http = require('http')

var hapi = require('hapi')
var pkg = require('hapi/package.json')

tracelyzer.setMaxListeners(Infinity)

suite('probes/hapi', function () {
  var server
  var host
  var url

  before(function (done) {
    server = viewServer()

    server.route({
      method: 'GET',
      path: '/controller',
      handler: function controller (request, reply) {
        reply('Hello, world!')
      }
    })

    server.route({
      method: 'GET',
      path: '/render',
      handler: function render (request, reply) {
        renderer(request, reply)('hello.ejs', {
          name: 'world'
        })
      }
    })

    server.start(function () {
      host = 'http://localhost:' + port
      done()
    })
  })
  after(function (done) {
    server.listener.close(function () {
      done()
    })
  })

  bench('controller', function (done) {
    multi_on(tracelyzer, 4, 'message', after(4, done))
    http.get(host + '/controller', function (res) { res.resume() })
  })

  bench('render', function (done) {
    multi_on(tracelyzer, 6, 'message', after(6, done))
    http.get(host + '/render', function (res) { res.resume() })
  })
})

//
// Helpers
//
var port = 3000
function makeServer (config) {
  config = config || {}
  var server

  if (semver.satisfies(pkg.version, '>= 9.0.0')) {
    server = new hapi.Server()
    server.register(require('vision'), function () {
      if (config.views) {
        server.views(config.views)
      }
    })
    server.connection({
      port: ++port
    })
  } else if (semver.satisfies(pkg.version, '>= 8.0.0-rc1')) {
    server = new hapi.Server()
    if (config.views) {
      server.views(config.views)
    }
    server.connection({
      port: ++port
    })
  } else if (semver.satisfies(pkg.version, '>= 1.10.0')) {
    server = new hapi.Server(++port)
    if (config.views) {
      server.views(config.views)
    }
  } else {
    server = new hapi.Server(++port, config)
  }

  return server
}
function viewServer () {
  return makeServer({
    views: {
      path: __dirname,
      engines: {
        ejs: require('ejs')
      }
    }
  })
}

function renderer (request, reply) {
  if (reply.view) {
    return reply.view.bind(reply)
  }
  if (request.reply && request.reply.view) {
    return request.reply.view.bind(request.reply)
  }
  return function () {}
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
