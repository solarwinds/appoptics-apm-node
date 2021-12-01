/* global it, describe, before, after, afterEach */
'use strict'

const base = process.cwd()
const path = require('path')

const helloDotEjs = 'hello.ejs'

const helper = require(path.join(base, 'test/helper'))
const ao = global[Symbol.for('AppOptics.Apm.Once')]

const axios = require('axios')

const hapiName = '@hapi/hapi'
const visionName = '@hapi/vision'

const hapi = require(hapiName)
const vision = require(visionName)

const pkg = require(`${hapiName}/package.json`)
const visionPkg = require(`${visionName}/package.json`)

const plugins = { plugin: require(visionName) }
const visionText = `${visionName} ${visionPkg.version}`

describe(`probes.${hapiName} ${pkg.version} ${visionText}`, function () {
  let emitter
  let port = 3500
  let clear

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
  afterEach(function () {
    if (clear) {
      clear()
      clear = undefined
    }
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
      msg.should.have.property('Layer', 'vision')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('TemplateLanguage', '.ejs')
      msg.should.have.property('TemplateFile', helloDotEjs)
      // msg.should.property('Layer', 'hapi-render');
      // msg.should.property('Label', 'entry');
    },
    renderExit (msg) {
      msg.should.have.property('Layer', 'vision')
      msg.should.have.property('Label', 'exit')
      // msg.should.property('Layer', 'hapi-render');
      // msg.should.property('Label', 'exit');
    },
    zlibEntry (msg) {
      msg.should.have.property('Layer', 'zlib')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Operation', 'Gzip')
      msg.should.have.property('Async', true)
    },
    zlibExit (msg) {
      msg.should.have.property('Layer', 'zlib')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // Helpers
  //
  async function makeServer (config) {
    config = config || {}

    const server = new hapi.Server({ port: ++port, compression: { minBytes: 1 } })
    if (!plugins) {
      return Promise.resolve(server)
    }
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
        server.listener.close(_resolve)
      })

      await server.start()

      axios({
        method,
        url: `http://localhost:${port}/hello/world`,
        headers: { 'accept-encoding': 'gzip' }
      })
        .then(r => {
          // nothing
        })
        .catch(e => {
          // eslint-disable-next-line no-console
          console.log(e)
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
        // kind of funky test in that nothing really checks the actual
        // result of the request, but really isn't the point, so it's all
        // good.
        if (plugins) {
          return h.view(helloDotEjs, { name: request.params.name })
        }
        return 'hello world'
      }
    })

    let _resolve
    const p = new Promise(function (resolve, reject) {
      _resolve = resolve
    })

    const validations = []
    validations.push(checks.httpEntry)
    validations.push(checks.hapiEntry)
    if (plugins) {
      validations.push(checks.renderEntry)
      validations.push(checks.renderExit)
    }
    validations.push(checks.hapiExit)
    validations.push(function (msg) {
      checks.httpExit(msg)
      msg.should.have.property('Controller', 'hapi.hello')
      msg.should.have.property('Action', 'get/hello/{name}')
    })

    helper.doChecks(emitter, validations, function () {
      server.listener.close(_resolve)
    })

    await server.start()

    axios(`http://localhost:${port}/hello/world`)

    return p
  }

  async function disabledTest () {
    ao.probes['@hapi/vision'].enabled = false
    const server = await makeViewServer()

    server.route({
      method: 'GET',
      path: '/hello/{name}',
      handler: function hello (request, h) {
        if (plugins) {
          return h.view(helloDotEjs, { name: request.params.name })
        }
        return 'hello worlds'
      }
    })

    let _resolve
    const p = new Promise(function (resolve, reject) {
      _resolve = resolve
    })

    const validations = [checks.httpEntry, checks.hapiEntry, checks.hapiExit, checks.httpExit]

    helper.doChecks(emitter, validations, function () {
      ao.probes['@hapi/vision'].enabled = true
      server.listener.close(_resolve)
    })

    await server.start()

    axios(`http://localhost:${port}/hello/world`)

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
        msg.should.have.property('Label').oneOf('entry', 'exit')
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
      const result = 'hapi.hello.' + request.method + request.route.path
      return result
    }

    const testFunction = customTransactionNameTest(custom)
    return testFunction()
  })

  it('should allow a custom TransactionName with domain prefix', function () {
    // simple custom function
    function custom (request) {
      const result = 'hapi.hello.' + request.method + request.route.path
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
      { level: 'error', message: 'hapi customNameFunc() error:', values: [error] }
    ]
    let getCount
    [getCount, clear] = helper.checkLogMessages(logChecks) // eslint-disable-line no-unused-vars
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
            return h.view(helloDotEjs, { name: request.params.name })
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
        checks.httpEntry,
        function (msg) {
          checks.hapiEntry(msg)
          msg.should.not.have.property('Async')
        },
        checks.hapiExit,
        function (msg) {
          checks.httpExit(msg)
          let expectedCustom = expected('tx')
          if (custom) {
            try {
              const expectedCustomName = custom(customReq)
              if (expectedCustomName) {
                expectedCustom = expectedCustomName
              }
            } catch (e) {
              // nothing to do if custom name function blows up.
            }
          }
          //
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

      axios(`http://localhost:${port}/hello/world`)

      return p
    }
  }

  //
  // helper function to return a function that returns expected results for:
  //   tx - transaction name
  //   c - controller
  //   a - action
  //
  function makeExpected (request, func) {
    // bind this when created. an error causes request.route
    // to become undefined
    const pathToUse = request.route.path

    return function (what) {
      let result

      // Controller = 'hapi.' + (func.name || '(anonymous)')
      // Action = request.method + request.route.path
      const controller = 'hapi.' + (func.name || '(anonymous)')
      const action = request.method + pathToUse

      if (what === 'tx') {
        result = controller + '.' + action
      } else if (what === 'c') {
        result = controller
      } else if (what === 'a') {
        result = action
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
