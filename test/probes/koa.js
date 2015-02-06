var Resource = require('koa-resource-router')
var router = require('koa-router')
var _ = require('koa-route')
var koa = require('koa')

var helper = require('../helper')
var request = require('request')

var rum = require('../../lib/rum')
var tv = require('../..')

var views = require('co-views')

var render = views('test/probes', {
  map: { ejs: 'ejs' },
  ext: 'ejs'
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

function after (n, fn) {
  return function () {
    n--
    if (n == 0) fn()
  }
}

function controllerValidations (controller, action) {
  var profileName = controller + ' ' + action
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

exports.route = function (emitter, done) {
  var app = koa()

  app.use(_.get('/hello/:name', function* hello () {
    this.body = 'done'
  }))

  var validations = controllerValidations('get /hello/:name', 'hello')
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  var server = app.listen(function () {
    var port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

exports.router = function (emitter, done) {
  var app = koa()

  app.use(router(app))

  app.get('/hello/:name', function* hello () {
    this.body = 'done'
  })

  var validations = controllerValidations('get /hello/:name', 'hello')
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  var server = app.listen(function () {
    var port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

exports.resourceRouter = function (emitter, done) {
  var app = koa()

  var res = new Resource('hello', {
    index: function* index () {
      this.body = 'done'
    }
  })

  app.use(res.middleware())

  var validations = controllerValidations('hello', 'index')
  helper.doChecks(emitter, validations, function () {
    server.close(done)
  })

  var server = app.listen(function () {
    var port = server.address().port
    request('http://localhost:' + port + '/hello')
  })
}

exports.render = function (emitter, done) {
  var app = koa()

  app.use(_.get('/hello/:name', function* (name) {
    this.body = yield render('hello', {
      name: name
    })
  }))

  var validations = [
    function (msg) {
      check['http-entry'](msg)
    },
    function (msg) {
      check['koa-entry'](msg)
    },
    function () {},
    function (msg) {
      check['render-entry'](msg)
      msg.should.have.property('TemplateFile')
      msg.should.have.property('TemplateLanguage', 'ejs')
    },
    function (msg) {
      check['render-exit'](msg)
    },
    function () {},
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

  var server = app.listen(function () {
    var port = server.address().port
    request('http://localhost:' + port + '/hello/world')
  })
}

exports.rum = function (emitter, done) {
  tv.rumId = 'foo'
  var app = koa()

  var exit

  app.use(function* () {
    exit = this.res._http_layer.events.exit
    this.body = yield render('rum')
  })

  var validations = [
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

  // Delay completion until both test paths end
  var complete = after(2, function () {
    server.close(done)
    delete tv.rumId
  })

  helper.doChecks(emitter, validations, complete)

  var server = app.listen(function () {
    var port = server.address().port
    request('http://localhost:' + port, function (a, b, body) {
      // Verify that the rum scripts are included in the body
      body.should.containEql(rum.header(tv.rumId, exit.toString()))
      body.should.containEql(rum.footer(tv.rumId, exit.toString()))
      complete()
    })
  })
}
