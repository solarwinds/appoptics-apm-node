var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
var semver = require('semver')
var rum = require('../rum')
var path = require('path')
var tv = require('..')
var Layer = tv.Layer
var conf = tv.hapi

function wrapPrepareMarshal (request) {
  shimmer.wrap(request, 'prepare', function (fn) {
    return function (response, callback) {
      var last = Layer.last
      var self = this

      if ( ! last) {
        return fn.call(self, response, callback)
      }

      var filename = response.source.template

      var layer = last.descend('hapi-render', {
        TemplateFile: filename,
        TemplateLanguage: path.extname(filename) || self._defaultExtension,
      })

      layer.async = true
      layer.enter()

      response.source._tv_render_layer = layer

      return fn.call(self, response, callback)
    }
  })

  shimmer.wrap(request, 'marshal', function (fn) {
    return function (response, callback) {
      var layer = response.source._tv_render_layer
      if ( ! layer) {
        return fn.call(this, response, callback)
      }

      response.source.context = response.source.context || {}
      if (tv.rumId) {
        var topLayer = tv.requestStore.get('topLayer')
        rum.inject(response.source.context, tv.rumId, topLayer.events.exit)
      }

      return fn.call(this, response, function () {
        layer.exit()
        return callback.apply(this, arguments)
      })
    }
  })
}

function wrapManager (manager) {
  shimmer.wrap(manager, '_response', function (fn) {
    return function () {
      var ret = fn.apply(this, arguments)
      wrapPrepareMarshal(ret._processors)
      return ret
    }
  })
}

function wrapRender (render, version) {
  return function (filename, context, options, callback) {
    context = context || {}
    var self = this

    function builder (last) {
      if (tv.rumId) {
        var topLayer = tv.requestStore.get('topLayer')
        rum.inject(context, tv.rumId, topLayer.events.exit)
      }

      return last.descend('hapi-render', {
        TemplateFile: filename,
        TemplateLanguage: path.extname(filename) || self._defaultExtension,
      })
    }

    function async (callback) {
      return render.call(self, filename, context, options, callback)
    }

    function sync () {
      return render.call(self, filename, context, options)
    }

    var isSync = version && semver.satisfies(version, '< 1.1.0')

    return tv.instrument(builder, isSync ? sync : async, conf, callback)
  }
}

function patchView (view, version) {
  if ( ! view.render._tv_patched) {
    shimmer.wrap(view, 'render', function (render) {
      return wrapRender(render, version)
    })
    view.render._tv_patched = true
  }
}

function patchConnection (conn) {
  function runAndPatchView (fn) {
    return function () {
      var ret = fn.apply(this, arguments)

      if (this._views) {
        patchView(this._views.constructor.prototype)
      } else if (this.pack && this.pack._env.views) {
        patchView(this.pack._env.views.constructor.prototype)

        // 8.0.0+
      } else if (this._server && this._server._env.views) {
        patchView(this._server._env.views.constructor.prototype)
      }

      return ret
    }
  }

  shimmer.wrap(conn, 'views',  runAndPatchView)
}

function patchGenerator (generator) {
  shimmer.wrap(generator, 'request', function (generator) {
    return function () {
      var ret = generator.apply(this, arguments)
      patchRequest(ret)
      return ret
    }
  })
}

function patchRequest (request) {
  shimmer.wrap(request, '_execute', function (execute) {
    // The route argument existed from 1.2.0 and older
    return function (route) {
      // Check if there is a trace to continue
      var last = Layer.last
      if ( ! last || ! conf.enabled) {
        return execute.call(this, route)
      }

      var layer = last.descend('hapi')
      var self = this

      layer.enter()

      shimmer.wrap(this.raw.res, 'end', function (realEnd) {
        return function () {
          var httpLayer = self.raw.res._http_layer
          var exit = httpLayer.events.exit

          var route = self._route || {}
          var handler = (route.settings || {}).handler || {}
          exit.Controller = route.path
          exit.Action = handler.name || '(anonymous)'

          layer.exit()
          return realEnd.apply(this, arguments)
        }
      })

      return execute.call(this, route)
    }
  })
}

function patchDecorator (plugin, version) {
  function wrapViews (views) {
    return function () {
      var ret = views.apply(this, arguments)

      var manager = this.realm.plugins.vision.manager
      if (version && semver.satisfies(version, '>= 9.0.0')) {
        wrapManager(manager)
      } else {
        manager.render = wrapRender(manager.render, version)
      }

      return ret
    }
  }

  shimmer.wrap(plugin, 'decorate', function (fn) {
    return function (name, method, handler) {
      if (name === 'server' && method === 'views') {
        handler = wrapViews(handler)
      }

      return fn.call(this, name, method, handler)
    }
  })
}

//
// Apply hapi patches
//
module.exports = function (hapi) {
  var pkg = requirePatch.relativeRequire('hapi/package.json')

  var Request = requirePatch.relativeRequire('hapi/lib/request')
  if (semver.satisfies(pkg.version, '>= 8.5.0')) {
    patchGenerator(Request.prototype)
  } else {
    patchRequest(Request.prototype)
  }

  var Connection
  var Server

  // After 7.2.0, Server became Connection
  if (semver.satisfies(pkg.version, '>= 8.0.0-rc5')) {
    var Plugin = requirePatch.relativeRequire('hapi/lib/plugin')
    Connection = requirePatch.relativeRequire('hapi/lib/connection')
    patchDecorator(Plugin.prototype, pkg.version)

  } else if (semver.satisfies(pkg.version, '>= 8.0.0-rc1')) {
    Server = requirePatch.relativeRequire('hapi/lib/server')
    Connection = requirePatch.relativeRequire('hapi/lib/connection')
    patchConnection(Server.prototype)

  } else if (semver.satisfies(pkg.version, '>= 7.2.0')) {
    Connection = requirePatch.relativeRequire('hapi/lib/connection')
    patchConnection(Connection.prototype)

  // After 2.0.0, View was not patchable directly
  } else if (semver.satisfies(pkg.version, '>= 6.0.0')) {
    Server = requirePatch.relativeRequire('hapi/lib/server')
    patchConnection(Server.prototype)

  // Beyond that, we can patch View directly
  } else {
    var View = requirePatch.relativeRequire('hapi/lib/views')
    if (semver.satisfies(pkg.version, '> 2.0.0')) {
      patchView(View.Manager.prototype)
    } else {
      patchView(View.prototype, pkg.version)
    }
  }

  return hapi
}
