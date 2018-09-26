'use strict'

const base = process.cwd()
const path = require('path')

const helloDotEjs = 'hello.ejs'

const helper = require(path.join(base, 'test/helper'))
const ao = helper.ao
const semver = require('semver')

const request = require('request')

// This test can't even be compiled if JavaScript doesn't recognize async/await.
const nodeVersion = process.version.slice(1)
const hasAsyncAwait = semver.gte(nodeVersion, '8.0.0')

if (!hasAsyncAwait) {
  throw new Error('hapi@17 testing requires async/await')
}

const hapi = require('hapi')
const vision = require('vision')

const pkg = require('hapi/package.json')
const visionPkg = require('vision/package.json')

if (semver.lt(pkg.version, '17.0.0')) {
  throw new Error('hapi-17-and-above requires hapi version 17+')
}

let plugins
let visionText
if (semver.gte(visionPkg.version, '5.0.0')) {
  plugins = {plugin: require('vision')}
  visionText = ' vision ' + visionPkg.version
} else {
  plugins = {}
  visionText = ' vision ' + visionPkg.version + ' not compatible (untested)'
}

describe('probes.hapi ' + pkg.version + visionText, function () {
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
    const p = server.register({plugin: require('vision')})

    return p.then(() => {
      if (config.views) {
        server.views(config.views)
      }
      return server
    })
  }

  async function viewServer () {
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

      let _resolve, _reject
      const p = new Promise(function (resolve, reject) {
        // save the resolution functions
        _resolve = resolve
        _reject = reject
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
    const server = await viewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, h) {
        console.log('hello:', ao.requestStore)
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
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Layer', 'hapi-render')
        msg.should.have.property('TemplateLanguage', '.ejs')
        msg.should.have.property('TemplateFile', helloDotEjs)
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
      server.listener.close(_resolve)
    })

    await server.start()

    request(`http://localhost:${port}/hello/world`)

    return p
  }

  async function disabledTest () {
    ao.probes.hapi.enabled = false
    const server = await viewServer()

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
        check['http-exit'](msg)
      }
    ]
    helper.doChecks(emitter, validations, function () {
      ao.probes.hapi.enabled = true
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
