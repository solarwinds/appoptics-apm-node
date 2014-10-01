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
// Each routing callback is patched individually as a profile
//
function routingCallbackReplacer (func) {
  return function (req, res, next) {
    // Check if we've stored an http layer to hook into
    var httpLayer = res._http_layer
    if ( ! httpLayer) {
      return func.apply(this, arguments)
    }

    // Store the latest middleware Controller/Action on exit
    var exit = httpLayer.events.exit
    exit.Controller = req.route.path
    exit.Action = func.name || '(anonymous)'

    // Create profile for this route function
    var args = argsToArray(arguments)
    var layer = Layer.last.profile('express-route', {
      Controller: req.route.path,
      Action: func.name || '(anonymous)'
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
      route.callbacks = route.callbacks.map(routingCallbackReplacer)
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
          args = args.map(routingCallbackReplacer)
          return method.apply(this, args)
        }
      })
    }
  })
}

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
          Locals: JSON.stringify(options || {})
        }

        // Run renderer
        return last.profile('express-render', data).run(function (wrap) {
          return run(wrap(callback))
        })
      }
    })
  }
}

module.exports = function (express) {
  requirePatch.disable()
  var pkg = require('express/package.json')
  requirePatch.enable()

  tv.versions['Node.Express.Version'] = pkg.version

  if (semver.satisfies(pkg.version, '>=4.0.0')) {
    v4(express)
  } else {
    v3(express)
  }

  // Skip instrumentation on old versions
  if (semver.satisfies(pkg.version, '< 3.2.0')) {
    debug('express ' + pkg.version + ' does not support render layers')
    return express
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

  return express
}
