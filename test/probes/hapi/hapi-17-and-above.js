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
        // save the resolution function
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
    it('should skip vision when disabled', disabledTest)
  } else {
    httpMethods.forEach(function (method) {
      it.skip('should forward controller/action data from ' + method + ' request', controllerTest(method))
    })
    it.skip('should trace render span', renderTest)
    it.skip('should skip vision when disabled', disabledTest)
  }

  //
  // custom transaction names
  //
  it('should allow a custom TransactionName', function () {
    // supply a simple custom function
    function custom (request) {
      const result = 'new-name.' + request.method + request.route.path
      return result
    }

    const testFunction = customTransactionNameTest(custom)
    return testFunction()
  })

  it('should allow a custom TransactionName with domain prefix', function () {
    // simple custom function
    function custom (request) {
      const result = 'new-name.' + request.method + request.route.path
      return result
    }

    ao.cfg.domainPrefix = true
    let r
    try {
      r = customTransactionNameTest(custom)()
    } finally {
      ao.cfg.domainPrefix = false
    }
    return r
  })

  it('should handle an error in the custom name function', function () {
    const error = new Error('I am a bad function')
    function custom (request) {
      throw error
    }
    const logChecks = [
      {level: 'error', message: 'hapi customNameFunc() error:', values: [error]},
    ]
    helper.checkLogMessages(ao.debug, logChecks)
    return customTransactionNameTest(custom)()
  })

  it('should handle a falsey return by the custom name function', function () {
    function custom (request) {
      return ''
    }
    return customTransactionNameTest(custom)()
  })


  //
  // this executes setting the custom name and tests the results.
  //
  function customTransactionNameTest (custom, useView = false) {
    const reqRoutePath = '/hello/{name}'
    let customReq
    let expected

    return async function () {
      // get a new server.
      const server = await (useView ? makeViewServer : makeServer)()

      server.route({
        method: 'GET',
        path: reqRoutePath,
        handler: function hello (request, h) {
          helper.clsCheck()
          customReq = request
          expected = makeExpected(request, hello)
          if (useView) {
            return h.view(helloDotEjs, {name: request.params.name})
          } else {
            return 'Hello, ' + request.params.name + '!'
          }

        }
      })

      ao.setCustomTxNameFunction('hapi', custom)

      let _resolve
      const p = new Promise(function (resolve, reject) {
        // save the resolution function. this doesn't need reject because
        // an error will cause the test to fail anyway.
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
          let expectedCustom = expected('tx')
          if (custom) {
            try {
              const expectedCustomName = custom(customReq)
              if (expectedCustomName) {
                expectedCustom = expectedCustomName
              }
            } catch (e) {
              // do nothing
            }
          }
          /*
          if (custom && custom(customReq)) {
            expectedCustom = custom(customReq)
          } else {
            expectedCustom = expected('tx')
          }
          // */
          if (ao.cfg.domainPrefix) {
            expectedCustom = customReq.headers.host + '/' + expectedCustom
          }
          msg.should.have.property('TransactionName', expectedCustom)
          msg.should.have.property('Controller', expected('c'))
          msg.should.have.property('Action', expected('a'))
        }
      ]
      helper.doChecks(emitter, validations, function () {
        server.listener.close(_resolve)
      })

      await server.start()

      request({
        method: 'GET',
        url: `http://localhost:${port}/hello/world`
      })

      return p
    }
  }


  //
  // helper function to return a function that returns expected results for:
  //   tx - transaction name
  //   c - controller
  //   a - action
  //   p - profile
  //
  function makeExpected (request, func) {
    // bind this when created. an error causes request.route
    // to become undefined
    const pathToUse = request.route.path

    return function (what) {
      let controller
      let action
      let result

      if (ao.probes.hapi.legacyTxname) {
        // old way of setting these
        // Controller = request.route.path
        // Action = func.name || '(anonymous)'
        controller = pathToUse
        action = func.name || '(anonymous)'
      } else {
        // new way
        // Controller = 'hapi.' + (func.name || '(anonymous)')
        // Action = request.method + request.route.path
        controller = 'hapi.' + (func.name || '(anonymous)')
        action = request.method + pathToUse
      }

      if (what === 'tx') {
        result = controller + '.' + action
      } else if (what === 'c') {
        result = controller
      } else if (what === 'a') {
        result = action
      } else if (what === 'p') {
        result = controller + ' ' + action
      }

      if (ao.cfg.domainPrefix && what === 'tx') {
        const prefix = ao.getDomainPrefix(request)
        if (prefix) {
          result = prefix + '/' + result
        }
      }

      return result
    }
  }
})
