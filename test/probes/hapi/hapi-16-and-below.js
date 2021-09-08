/* global it, describe, before, after */
'use strict'

const base = process.cwd()
const path = require('path')

const helloDotEjs = 'hello.ejs'

const helper = require(path.join(base, 'test/helper'))
const { ao } = require('../../1.test-common')

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
  let port = 3500

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.g.testing(__filename)
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
  })

  const checks = {
    httpEntry: function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'entry')
    },
    httpExit: function (msg) {
      msg.should.have.property('Layer', 'nodejs')
      msg.should.have.property('Label', 'exit')
    },
    hapiEntry: function (msg) {
      msg.should.have.property('Layer', 'hapi')
      msg.should.have.property('Label', 'entry')
    },
    hapiExit: function (msg) {
      msg.should.have.property('Layer', 'hapi')
      msg.should.have.property('Label', 'exit')
    },
    renderEntry (msg) {
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Layer', 'hapi-render')
    },
    renderExit (msg) {
      msg.should.have.property('Label', 'exit')
      msg.should.have.property('Layer', 'hapi-render')
    },
    zlibEntry: function zlibEntry (msg) {

    },
    zlibExit: function zlibExit (msg) {

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
      server = new hapi.Server({ port: ++port })
      p = server.register({ plugin: require('vision') })
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

      // setup validations
      const validations = []
      validations.push(checks.httpEntry)
      validations.push(function (msg) {
        checks.hapiEntry(msg)
        msg.should.not.property('Async')
      })
      validations.push(checks.zlibEntry)
      validations.push(checks.zlibExit)
      validations.push(checks.hapiExit)
      validations.push(function (msg) {
        checks.httpExit(msg)
        msg.should.have.property('Controller', 'hapi.hello')
        msg.should.have.property('Action', method + '/hello/{name}')
      })

      helper.doChecks(emitter, validations, function () {
        server.listener.close(function () {
          done()
        })
      })

      p.then(() => {
        server.start(function () {
          request({
            method: method.toUpperCase(),
            url: `http://localhost:${port}/hello/world`,
            headers: { 'accept-encoding': 'gzip' }
          }).on('response', function (r) {
            // console.log('got response', r.headers);
          })
        })
      })
    }
  }

  function renderTestWith (done) {
    renderTest(done, helloDotEjs)
  }

  function renderTestWithout (done) {
    renderTest(done, 'hello')
  }

  function renderTest (done, filename) {
    const server = viewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, reply) {
        renderer(request, reply)(filename, {
          name: request.params.name
        })
      }
    })

    // setup validations
    const validations = []
    validations.push(checks.httpEntry)
    validations.push(checks.hapiEntry)
    validations.push(function (msg) {
      checks.renderEntry(msg)
      msg.should.have.property('TemplateLanguage', 'ejs')
      msg.should.have.property('TemplateFile', filename)
    })
    validations.push(checks.renderExit)
    validations.push(checks.hapiExit)
    validations.push(function (msg) {
      checks.httpExit(msg)
      msg.should.have.property('Controller', 'hapi.hello')
      msg.should.have.property('Action', 'get/hello/{name}')
    })

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
        renderer(request, reply)(helloDotEjs, {
          name: request.params.name
        })
      }
    })

    // setup validations
    const validations = [checks.httpEntry, checks.httpExit]

    helper.doChecks(emitter, validations, function () {
      ao.probes.hapi.enabled = true
      server.listener.close(done)
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

  //
  // run the tests
  //
  const httpMethods = ['get', 'post', 'put', 'delete']
  if (hapi && vision) {
    httpMethods.forEach(function (method) {
      it('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it('should skip when disabled', disabledTest)
    it('should trace render span with template extension', renderTestWith)
    it('should trace render span without template extension', renderTestWithout)
  } else {
    httpMethods.forEach(function (method) {
      it.skip('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it.skip('should skip when disabled', disabledTest)
    it.skip('should trace render span', renderTest)
  }
})
