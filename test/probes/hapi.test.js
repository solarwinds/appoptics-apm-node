'use strict'

const helper = require('../helper')
const ao = helper.ao
const semver = require('semver')

const request = require('request')

// Don't even load hapi in 0.8. Bad stuff will happen.
const nodeVersion = process.version.slice(1)
const hasES6 = semver.satisfies(nodeVersion, '> 4')
const pkg = require('hapi/package.json')
let hapi
let vision
let visionPkg
if (semver.satisfies(nodeVersion, '> 0.8')) {
  if (hasES6 || semver.satisfies(pkg.version, '< 13.6')) {
    hapi = require('hapi')
  }

  visionPkg = require('vision/package.json')
  if (hasES6 || semver.satisfies(visionPkg.version, '<= 4.1.1')) {
    vision = require('vision')
  }
}


describe('probes.hapi ' + pkg.version + ' vision ' + visionPkg.version, function () {
  let emitter
  let port = 3000

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
  })

  const check = {
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

  // the promise in case it's not hapi v17
  let p = Promise.resolve()

  //
  // Helpers
  //
  function makeServer (config) {
    config = config || {}
    let server

    if (semver.gte(pkg.version, '17.0.0')) {
      server = new hapi.Server({port: ++port})
      p = server.register({plugin: require('vision')})
      p.then(() => {
        if (config.views) {
          server.views(config.views)
        }
      })
    } else if (semver.satisfies(pkg.version, '>= 9.0.0')) {
      server = new hapi.Server()
      server.register(vision, function () {
        if (config.views) {
          server.views(config.views)
        }
      })
      server.connection({
        port: ++port
      })
    } else if (semver.satisfies(pkg.version, '>= 8.0.0')) {
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
    const config = {
      views: {
        path: __dirname,
        engines: {
          ejs: require('ejs')
        }
      }
    }

    // Avoid "not allowed" errors from pre-8.x versions
    if (semver.gte(pkg.version, '8.0.0')) {
      config.relativeTo = __dirname
    }

    return makeServer(config)
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
      const server = makeServer()

      server.route({
        method: method.toUpperCase(),
        path: '/hello/{name}',
        handler: function hello (request, reply) {
          reply('Hello, ' + request.params.name + '!')
        }
      })

      const validations = [
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

      p.then(() => {
        server.start(function () {
          request({
            method: method.toUpperCase(),
            url: 'http://localhost:' + port + '/hello/world'
          })
        })
      })
    }
  }

  function renderTest (done) {
    const server = viewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, reply) {
        renderer(request, reply)('hello.ejs', {
          name: request.params.name
        })
      }
    })

    const validations = [
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

    p.then(() => {
      server.start(function () {
        request('http://localhost:' + port + '/hello/world')
      })
    })
  }

  function disabledTest (done) {
    ao.probes.hapi.enabled = false
    const server = viewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, reply) {
        renderer(request, reply)('hello.ejs', {
          name: request.params.name
        })
      }
    })

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.listener.close(done)
      ao.probes.hapi.enabled = true
    })

    p.then(() => {
      server.start(function () {
        request({
          method: 'GET',
          url: 'http://localhost:' + port + '/hello/world'
        })
      })
    })
  }


  // this test exists only to fix a problem with oboe not reporting a UDP
  // send failure.
  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit'),
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  const httpMethods = ['get', 'post', 'put', 'delete']
  if (hapi && vision) {
    httpMethods.forEach(function (method) {
      it('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it('should skip when disabled', disabledTest)
    it('should trace render span', renderTest)
  } else {
    httpMethods.forEach(function (method) {
      it.skip('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it.skip('should skip when disabled', disabledTest)
    it.skip('should trace render span', renderTest)
  }
})
