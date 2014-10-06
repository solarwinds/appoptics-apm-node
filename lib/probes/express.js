var debug = require('debug')('traceview:probes:express')
var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
var methods = require('methods')
var Layer = require('../layer')
var semver = require('semver')
var rum = require('../rum')
var tv = require('..')
var os = require('os')

function argsToArray (args) {
  var length = args.length
  var res = []
  var i = 0
  for (; i < length; i++) {
    res[i] = args[i]
  }
  return res
}

function once (fn) {
  var used = false
  return function () {
    if ( ! used) fn.apply(this, arguments)
    used = true
  }
}

//
// Patch routing system to profile each routing function
//
function routeProfiling (express, version) {

  //
  // Each routing callback is patched individually as a profile
  //
  function profiledRoute (func) {
    return function (req, res, next) {
      // Check if we've stored an http layer to hook into
      var httpLayer = res._http_layer
      if ( ! httpLayer) {
        return func.apply(this, arguments)
      }

      // Determine controller and action values
      // NOTE: express has no "controller" concept, url pattern will suffice
      var controller = req.route.path
      var action = func.name || '(anonymous)'

      // Store the latest middleware Controller/Action on exit
      var exit = httpLayer.events.exit
      exit.Controller = controller
      exit.Action = action

      // Create profile for this route function
      var args = argsToArray(arguments)
      var layer = Layer.last.profile(controller + ' ' + action, {
        Controller: controller,
        Action: action
      })

      // We need to use manual mode
      layer.enter()

      // Create wrapper to only send exit once
      var done = once(layer.exit.bind(layer))

      // The exit point of the middleware may be res.end()
      // TODO: Figure out a better way then patching for every middleware
      shimmer.wrap(res, 'end', function (realEnd) {
        return function () {
          done()
          return realEnd.apply(this, arguments)
        }
      })

      // Or it may be the next arguments, in which case, we should
      // replace it with a wrapper to send exit, if not already sent
      var realNext = args.pop()
      args.push(function () {
        done()
        return realNext.apply(this, arguments)
      })

      return func.apply(this, args)
    }
  }

  //
  // Patch express 3.x style apps
  //
  function v3 (express) {
    shimmer.wrap(express.Router.prototype, 'route', function (fn) {
      return function (method) {
        var ret = fn.apply(this, arguments)
        var routes = ret.map[method.toLowerCase()]
        var route = routes[routes.length - 1]
        route.callbacks = route.callbacks.map(profiledRoute)
        return ret
      }
    })
  }

  //
  // Patch express 4.x style apps
  //
  function v4 (express) {
    methods.concat('all').forEach(function (method) {
      if (express.Route.prototype[method]) {
        shimmer.wrap(express.Route.prototype, method, function (method) {
          return function (req, res, next) {
            var args = argsToArray(arguments)
            return method.apply(this, args.map(profiledRoute))
          }
        })
      }
    })
  }

  //
  // Use appropriate patch for express version
  //
  if (semver.satisfies(version, '>=4.0.0')) {
    v4(express)
  } else {
    v3(express)
  }
}

//
// Patch rendering system to profile render calls
//
function renderProfiling (express, version) {

  //
  // The View constructor is patched to report render timing
  //
  function patchView (View) {
    if ( ! View._tv_express_patched) {
      View._tv_express_patched = true
      shimmer.wrap(View.prototype, 'render', function (render) {
        return function (options, callback) {
          var args = argsToArray(arguments)
          var tail = args[args.length - 1]

          // Find or create a callback
          if (typeof tail === 'function') {
            callback = args.pop()
          } else {
            callback = function () {}
          }

          // Bind a curried runner of the real render function
          var run = render.bind.apply(render, [this].concat(args))

          // Check if there is a trace to continue
          var last = Layer.last
          if ( ! tv.tracing || ! last) {
            return run(callback)
          }

          if (tv.rumId) {
            // Find top layer
            var topLayer = tv.requestStore.get('topLayer')
            rum.inject(options, tv.rumId, topLayer.events.exit)
          }

          // Supply template rendering spec data
          var data = {
            TemplateFile: this.name,
            TemplateLanguage: this.ext,

            // TODO: Disable for now. Maybe include behind config flag later.
            // Locals: JSON.stringify(options || {})
          }

          // Run renderer
          return last.descend('express-render', data).run(function (wrap) {
            return run(wrap(callback))
          })
        }
      })
    }
  }

  // Skip instrumentation on old versions
  if (semver.satisfies(version, '< 3.2.0')) {
    debug('express ' + version + ' does not support render layers')
    return
  }

  // The View constructor needs to be patched to trace render calls,
  // but is only accessible after defaultConfiguration is called.
  shimmer.wrap(express.application, 'defaultConfiguration', function (defaultConfiguration) {
    return function () {
      var ret = defaultConfiguration.apply(this)
      var View = this.get('view')
      patchView(View)
      return ret
    }
  })
}

//
// Patch app.handle() to create express layer
//
function expressLayer (express) {
  function createApplication () {
    var app = express()

    // NOTE: For express 4.x the 'handle' method is in express.application,
    // while for 3.x it is actually in connect itself.
    shimmer.wrap(app, 'handle', function (handle) {
      return function (req, res, next) {
        // Check if there is a trace to continue
        var last = Layer.last
        if ( ! tv.tracing || ! last) {
          return handle.call(this, req, res, next)
        }

        var layer = last.descend('express')
        layer.enter()

        shimmer.wrap(res, 'end', function (realEnd) {
          return function () {
            layer.exit()
            return realEnd.apply(this, arguments)
          }
        })

        return handle.call(this, req, res, next)
      }
    })

    return app
  }

  // Copy properties to createApplication proxy function
  for (var i in express) {
    createApplication[i] = express[i]
  }

  return createApplication
}

//
// Apply express patches
//
module.exports = function (express) {
  requirePatch.disable()
  var pkg = require('express/package.json')
  requirePatch.enable()

  tv.versions['Node.Express.Version'] = pkg.version

  // Wrap everything in express inside an express layer
  express = expressLayer(express)

  // Profile each route callback
  routeProfiling(express, pkg.version)

  // Profile render calls
  renderProfiling(express, pkg.version)

  return express
}
