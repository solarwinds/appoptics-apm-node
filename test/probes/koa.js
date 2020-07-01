'use strict'

const Resource = require('koa-resource-router')
const Router = require('koa-router')
const _ = require('koa-route')
const koa = require('koa')

const semver = require('semver')
const koaRouterVersion = require('koa-router/package.json').version

const helper = require('../helper')
const request = require('request')

const {ao} = require('../1.test-common')

const views = require('co-views')

const render = views('test/probes', {
  map: {ejs: 'ejs'},
  ext: 'ejs'
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
  'koa-entry': function (msg) {
    msg.should.have.property('Layer', 'koa')
    msg.should.have.property('Label', 'entry')
  },
  'koa-exit': function (msg) {
    msg.should.have.property('Layer', 'koa')
    msg.should.have.property('Label', 'exit')
  },
  'render-entry': function (msg) {
    msg.should.have.property('Layer', 'co-render')
    msg.should.have.property('Label', 'entry')
  },
  'render-exit': function (msg) {
    msg.should.have.property('Layer', 'co-render')
    msg.should.have.property('Label', 'exit')
  }
}

function controllerValidations (...args) {
  if (args.length % 3 !== 0) {
    throw new Error('controllerValidations requires arg count to be a multiple of 3')
  }

  let checks = [
    function (msg) {
      check['http-entry'](msg)
    },
    function (msg) {
      check['koa-entry'](msg)
    },
  ]
  const exits = []
  let c
  let a
  for (let i = 0; i < args.length; i += 3) {
    const layer = args[i + 0]
    const controller = args[i + 1]
    const action = args[i + 2]

    c = controller
    a = action

    checks.push(function (msg) {
      msg.should.have.property('Layer', layer)
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Controller', controller)
      msg.should.have.property('Action', action)
    })
    exits.unshift(function (msg) {
      msg.should.have.property('Layer', layer)
      msg.should.have.property('Label', 'exit')
    })
  }

  checks = checks.concat(exits)
  checks = checks.concat([
    function (msg) {
      check['koa-exit'](msg)
    },
    function (msg) {
      check['http-exit'](msg)
      msg.should.have.property('Controller', c)
      msg.should.have.property('Action', a)
    }
  ])

  return checks

}

exports.basic = function (emitter, done) {
  const app = koa()

  app.use(function* () {
    this.body = 'done'
  })

  helper.doChecks(emitter, [
    function (msg) { check['http-entry'](msg) },
    function (msg) { check['koa-entry'](msg) },
    function (msg) { check['koa-exit'](msg) },
    function (msg) { check['http-exit'](msg) }
  ], function () {
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

exports.disabled = function (emitter, done) {
  ao.probes.koa.enabled = false
  const app = koa()

  app.use(function* () {
    this.body = 'done'
  })

  helper.doChecks(emitter, [
    function (msg) { check['http-entry'](msg) },
    function (msg) { check['http-exit'](msg) }
  ], function () {
    ao.probes.koa.enabled = true
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port)
  })
}

//
// koa-route tests
//
// koa-route is a simple version of koa-router
//
// https://www.npmjs.com/package/koa-route
//
exports.route = function (emitter, done) {
  const app = koa()

  app.use(_.get('/hello/:name', function* hello () {
    this.body = 'done'
  }))

  const validations = controllerValidations('koa-route', 'get /hello/:name', 'hello')
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

exports.route_disabled = function (emitter, done) {
  ao.probes['koa-route'].enabled = false
  const app = koa()

  app.use(_.get('/hello/:name', function* hello () {
    this.body = 'done'
  }))

  helper.doChecks(emitter, [
    function (msg) { check['http-entry'](msg) },
    function (msg) { check['koa-entry'](msg) },
    function (msg) { check['koa-exit'](msg) },
    function (msg) { check['http-exit'](msg) }
  ], function () {
    ao.probes['koa-route'].enabled = true
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

//
// koa-router tests
//
// this seems to be the primary koa-router implementation.
//
// https://github.com/alexmingoia/koa-router
//
exports.router = function (emitter, done) {
  const app = koa()

  // Mount router
  const r = Router(app)

  let spanName = 'koa-router:hello'
  if (semver.gte(koaRouterVersion, '6.0.0')) {
    // if koa-router requires koa version 2 and no longer
    // supports generators.
    const hello = (ctx) => {
      ctx.body = 'done'
    }
    app.use(r.routes())
    r.get('/hello/:name', hello)
  } else {
    spanName = 'koa-router-handler'
    function* hello () {
      this.body = 'done'
    }
    // koa-router v5 and below - app.use() requires a generator
    // and router(app).routes() returns one (unless it's a really)
    // old version in which case just app.use(r).
    if (typeof r.routes === 'function' ) {
      app.use(r.routes())
      r.get('/hello/:name', hello)
    } else {
      app.use(r)
      app.get('/hello/:name', hello)
    }
  }

  const validations = controllerValidations(spanName, 'get /hello/:name', 'hello')
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

exports.router_promise = function (emitter, done) {
  const app = koa()
  const controller = new Router()

  const handler = (ctx, next) => {
    return next().then(() => {
      ctx.status = 200
    })
  }

  const handler2 = (ctx, next) => {
    return next().then(() => {
      ctx.body = 'Hello Koa'
    })
  }

  controller.post('/api/visit', handler2, handler, handler)
  app.use(controller.routes())

  const validations = controllerValidations(
    'koa-router:handler2',
    'post /api/visit',
    'handler2',
    'koa-router:handler',
    'post /api/visit',
    'handler',
    'koa-router:handler',
    'post /api/visit',
    'handler'
  )
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request.post('http://localhost:' + port + '/api/visit')
  })
}

exports.router_disabled = function (emitter, done) {
  ao.probes['koa-router'].enabled = false
  const app = koa()

  function* hello () {
    this.body = 'done'
  }

  // Mount router
  const r = Router(app)
  if (typeof r.routes === 'function') {
    app.use(r.routes())
    r.get('/hello/:name', hello)
  } else {
    app.use(r)
    app.get('/hello/:name', hello)
  }

  helper.doChecks(emitter, [
    function (msg) { check['http-entry'](msg) },
    function (msg) { check['koa-entry'](msg) },
    function (msg) { check['koa-exit'](msg) },
    function (msg) { check['http-exit'](msg) }
  ], function () {
    ao.probes['koa-router'].enabled = true
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

//
// koa-resource-router tests
//
// rails-style resource routing for koa. done by the same guy as
// koa-router, but has not been updated in 4 years as of 2019-01.
//
// https://github.com/alexmingoia/koa-resource-router
//
exports.resourceRouter = function (emitter, done) {
  const app = koa()

  const res = new Resource('hello', {
    index: function* index () {
      this.body = 'done'
    }
  })

  app.use(res.middleware())

  const validations = controllerValidations('koa-resource-router', 'hello', 'index')
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello')
  })
}

exports.resourceRouter_disabled = function (emitter, done) {
  ao.probes['koa-resource-router'].enabled = false
  const app = koa()

  const res = new Resource('hello', {
    index: function* index () {
      this.body = 'done'
    }
  })

  app.use(res.middleware())

  helper.doChecks(emitter, [
    function (msg) { check['http-entry'](msg) },
    function (msg) { check['koa-entry'](msg) },
    function (msg) { check['koa-exit'](msg) },
    function (msg) { check['http-exit'](msg) }
  ], function () {
    ao.probes['koa-resource-router'].enabled = true
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello')
  })
}

exports.render = function (emitter, done) {
  const app = koa()

  app.use(function* () {
    this.body = yield render('hello', {
      name: 'world'
    })
  })

  const validations = [
    function (msg) {
      check['http-entry'](msg)
    },
    function (msg) {
      check['koa-entry'](msg)
    },
    function (msg) {
      check['render-entry'](msg)
      msg.should.have.property('TemplateFile')
      msg.should.have.property('TemplateLanguage', 'ejs')
    },
    function (msg) {
      check['render-exit'](msg)
    },
    function (msg) {
      check['koa-exit'](msg)
    },
    function (msg) {
      check['http-exit'](msg)
    }
  ]

  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port)
  })
}

exports.render_disabled = function (emitter, done) {
  ao.probes['co-render'].enabled = false;
  ao.probes['http-client'].enabled = false;
  const app = koa()

  app.use(function* () {
    this.body = yield render('hello', {
      name: 'world'
    })
  })

  const validations = [
    function (msg) {
      check['http-entry'](msg)
    },
    function (msg) {
      check['koa-entry'](msg)
    },
    function (msg) {
      check['koa-exit'](msg)
    },
    function (msg) {
      check['http-exit'](msg)
    }
  ]

  helper.doChecks(emitter, validations, function () {
    ao.probes['co-render'].enabled = true;
    ao.probes['http-client'].enabled = true;
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port)
  })
}
