var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var semver = require('semver')

var rum = require('../../lib/rum')
var path = require('path')

var request = require('request')
var fs = require('fs')

// Don't even load hapi in 0.8. Bad stuff will happen.
var hapi
if (semver.satisfies(process.version.slice(1), '> 0.8')) {
  hapi = require('hapi')
}

var pkg = require('hapi/package.json')

describe('probes.hapi', function () {
  var emitter
  var port = 3000

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  // Yes, this is really, actually needed.
  // Sampling may actually prevent reporting,
  // if the tests run too fast. >.<
  beforeEach(function (done) {
    helper.padTime(done)
  })

  var check = {
    'http-entry': function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'entry')
    },
    'http-exit': function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'exit')
    },
    'hapi-entry': function (msg) {
      msg.should.have.property('Layer', 'hapi')
      msg.should.have.property('Label', 'entry')
    },
    'hapi-exit': function (msg) {
      msg.should.have.property('Layer', 'hapi')
      msg.should.have.property('Label', 'exit')
    },
    'render-exit': function (msg) {
      msg.should.have.property('Layer', 'render')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Helpers
  //
  function makeServer (config) {
    config = config || {}
    var server

    if (semver.satisfies(pkg.version, '>= 8.0.0-rc1')) {
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

  //
  // Tests
  //
  function controllerTest (method) {
    return function (done) {
      var server = makeServer()

      server.route({
        method: method.toUpperCase(),
        path: '/hello/{name}',
        handler: function hello (request, reply) {
          reply('Hello, ' + request.params.name + '!')
        }
      })

      var validations = [
        function (msg) {
          check['http-entry'](msg)
        },
        function (msg) {
          check['hapi-entry'](msg)
          msg.should.not.have.property('Async')
        },
        function (msg) {
          check['hapi-exit'](msg)
        },
        function (msg) {
          check['http-exit'](msg)
          msg.should.have.property('Controller', '/hello/{name}')
          msg.should.have.property('Action', 'hello')
        }
      ]
      helper.doChecks(emitter, validations, function () {
        server.listener.close(function () {
          done()
        })
      })

      server.start(function () {
        request({
          method: method.toUpperCase(),
          url: 'http://localhost:' + port + '/hello/world'
        })
      })
    }
  }

  function renderTest (done) {
    var server = viewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, reply) {
        renderer(request, reply)('hello.ejs', {
          name: request.params.name
        })
      }
    })

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['hapi-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Layer', 'hapi-render')
        msg.should.have.property('TemplateLanguage', '.ejs')
        msg.should.have.property('TemplateFile', 'hello.ejs')
      },
      function (msg) {
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Layer', 'hapi-render')
      },
      function (msg) {
        check['hapi-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', '/hello/{name}')
        msg.should.have.property('Action', 'hello')
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.listener.close(done)
    })

    server.start(function () {
      request('http://localhost:' + port + '/hello/world')
    })
  }

  function rumTest (done) {
    var server = viewServer()
    tv.rumId = 'foo'
    var exit

    server.route({
      method: 'GET',
      path: '/',
      handler: function hello (request, reply) {
        exit = request.raw.res._http_layer.events.exit
        renderer(request, reply)('rum.ejs')
      }
    })

    var validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['hapi-entry'](msg)
      },
      function (msg) {
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Layer', 'hapi-render')
        msg.should.have.property('TemplateLanguage', '.ejs')
        msg.should.have.property('TemplateFile', 'rum.ejs')
      },
      function (msg) {
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Layer', 'hapi-render')
      },
      function (msg) {
        check['hapi-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', '/')
        msg.should.have.property('Action', 'hello')
      }
    ]

    // Delay completion until both test paths end
    var complete = helper.after(2, function () {
      server.listener.close(done)
      delete tv.rumId
    })

    // Run tracelyzer checks
    helper.doChecks(emitter, validations, complete)

    server.start(function () {
      request('http://localhost:' + port, function (a, b, body) {
        // Verify that the rum scripts are included in the body
        body.should.containEql(rum.header(tv.rumId, exit.toString()))
        body.should.containEql(rum.footer(tv.rumId, exit.toString()))
        complete()
      })
    })
  }

  var httpMethods = ['get','post','put','delete']
  if (semver.satisfies(process.version.slice(1), '> 0.8')) {
    httpMethods.forEach(function (method) {
      it('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it('should trace render layer', renderTest)
    it('should include RUM scripts', rumTest)
  } else {
    httpMethods.forEach(function (method) {
      it.skip('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it.skip('should trace render layer', renderTest)
    it.skip('should include RUM scripts', rumTest)
  }
})
