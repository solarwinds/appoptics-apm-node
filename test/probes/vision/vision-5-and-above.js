'use strict'

const base = process.cwd()
const path = require('path')

const helloDotEjs = 'hello.ejs'

const helper = require(path.join(base, 'test/helper'))
const ao = helper.ao
const semver = require('semver')
const should = require('should')

const request = require('request')

// This test can't even be compiled if JavaScript doesn't recognize async/await.
const nodeVersion = process.version.slice(1)
const hasAsyncAwait = semver.gte(nodeVersion, '8.0.0')

if (!hasAsyncAwait) {
  throw new Error('hapi@17 testing requires async/await')
}

const hapi = require('hapi')
const vision = require('vision')

const pkg = require('vision/package.json')
const hapiPkg = require('hapi/package.json')

if (semver.lt(hapiPkg.version, '17.0.0')) {
  throw new Error('vision-5-and-above requires hapi version 17+')
}

let plugins
let hapiText
if (semver.gte(pkg.version, '5.0.0')) {
  plugins = {plugin: require('vision')}
  hapiText = ' hapi ' + hapiPkg.version
}

describe('probes.vision ' + pkg.version + hapiText, function () {
  let emitter
  let port = 3000

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    helper.ao.resetRequestStore()
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

  //
  // Helpers
  //
  async function makeServer (config) {
    config = config || {}

    const server = new hapi.Server({port: ++port})
    const p = server.register(plugins)

    return p.then(() => {
      if (config.views) {
        server.views(config.views)
      }
      return server
    })
  }

  async function makeViewServer () {
    const config = {
      views: {
        path: __dirname,
        engines: {
          ejs: require('ejs')
        }
      }
    }

    return makeServer(config)
  }

  /* reply is not a thing in v17+
  function renderer (request, reply) {
    if (reply.view) {
      return reply.view.bind(reply)
    }
    if (request.reply && request.reply.view) {
      return request.reply.view.bind(request.reply)
    }
    return function () {}
  }
  // */

  //
  // Tests
  //
  function controllerTest (method) {
    return async function () {
      const server = await makeServer()

      server.route({
        method: method.toUpperCase(),
        path: '/hello/{name}',
        handler: function hello (request, h) {
          return 'Hello, ' + request.params.name + '!'
        }
      })

      let _resolve
      const p = new Promise(function (resolve, reject) {
        // save the resolution functions
        _resolve = resolve
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
          msg.should.have.property('Controller', 'hapi.hello')
          msg.should.have.property('Action', method + '/hello/{name}')
        }
      ]
      helper.doChecks(emitter, validations, function () {
        server.listener.close(_resolve)
      })

      await server.start()

      request({
        method: method.toUpperCase(),
        url: `http://localhost:${port}/hello/world`
      })

      return p
    }
  }

  async function renderTest () {
    const server = await makeViewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, h) {
        return h.view(helloDotEjs, {name: request.params.name})
      }
    })

    let _resolve
    const p = new Promise(function (resolve, reject) {
      _resolve = resolve
    })

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['hapi-entry'](msg)
      },
      //*
      function (msg) {
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Layer', 'vision')
        msg.should.have.property('TemplateLanguage', '.ejs')
        msg.should.have.property('TemplateFile', helloDotEjs)
      },
      function (msg) {
        msg.should.have.property('Label', 'exit')
        msg.should.have.property('Layer', 'vision')
      },
      // */
      function (msg) {
        check['hapi-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
        msg.should.have.property('Controller', 'hapi.hello')
        msg.should.have.property('Action', 'get/hello/{name}')
      }
    ]
    helper.doChecks(emitter, validations, function () {
      server.listener.close(_resolve)
    })

    await server.start()

    request(`http://localhost:${port}/hello/world`)

    return p
  }

  async function disabledTest () {
    ao.probes.vision.enabled = false
    const server = await makeViewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, h) {
        return h.view(helloDotEjs, {name: request.params.name})
      }
    })

    let _resolve
    const p = new Promise(function (resolve, reject) {
      _resolve = resolve
    })

    const validations = [
      function (msg) {
        check['http-entry'](msg)
      },
      function (msg) {
        check['hapi-entry'](msg)
      },
      function (msg) {
        check['hapi-exit'](msg)
      },
      function (msg) {
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      ao.probes.vision.enabled = true
      server.listener.close(_resolve)
    })

    await server.start()

    request({method: 'GET', url: `http://localhost:${port}/hello/world`})

    return p
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
    it('should trace render span', renderTest)
    it('should skip when disabled', disabledTest)
  } else {
    httpMethods.forEach(function (method) {
      it.skip('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it.skip('should trace render span', renderTest)
    it.skip('should skip when disabled', disabledTest)
  }
})
