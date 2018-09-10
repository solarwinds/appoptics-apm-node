'use strict'

const Resource = require('koa-resource-router')
const router = require('koa-router')
const _ = require('koa-route')
const koa = require('koa')

const helper = require('../helper')
const request = require('request')

const ao = require('../..')

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

function controllerValidations (controller, action) {
  const profileName = controller + ' ' + action
  return [
    function (msg) {
      check['http-entry'](msg)
    },
    function (msg) {
      check['koa-entry'](msg)
    },
    function (msg) {
      msg.should.have.property('Label', 'profile_entry')
      msg.should.have.property('ProfileName', profileName)
      msg.should.have.property('Controller', controller)
      msg.should.have.property('Action', action)
    },
    function (msg) {
      msg.should.have.property('Label', 'profile_exit')
      msg.should.have.property('ProfileName', profileName)
    },
    function (msg) {
      check['koa-exit'](msg)
    },
    function (msg) {
      check['http-exit'](msg)
      msg.should.have.property('Controller', controller)
      msg.should.have.property('Action', action)
    }
  ]
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

exports.route = function (emitter, done) {
  const app = koa()

  app.use(_.get('/hello/:name', function* hello () {
    this.body = 'done'
  }))

  const validations = controllerValidations('get /hello/:name', 'hello')
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

exports.router = function (emitter, done) {
  const app = koa()

  function* hello () {
    this.body = 'done'
  }

  // Mount router
  const r = router(app)
  if (typeof r.routes === 'function') {
    app.use(r.routes())
    r.get('/hello/:name', hello)
  } else {
    app.use(r)
    app.get('/hello/:name', hello)
  }

  const validations = controllerValidations('get /hello/:name', 'hello')
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

exports.router_disabled = function (emitter, done) {
  ao.probes['koa-router'].enabled = false
  const app = koa()

  function* hello () {
    this.body = 'done'
  }

  // Mount router
  const r = router(app)
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

exports.resourceRouter = function (emitter, done) {
  const app = koa()

  const res = new Resource('hello', {
    index: function* index () {
      this.body = 'done'
    }
  })

  app.use(res.middleware())

  const validations = controllerValidations('hello', 'index')
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
  ao.probes['co-render'].enabled = false
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
    ao.probes['co-render'].enabled = true
    server.close(done)
  })

  const server = app.listen(function () {
    const port = server.address().port
    request('http://localhost:' + port)
  })
}
