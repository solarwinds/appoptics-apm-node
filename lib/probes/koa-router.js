var shimmer = require('shimmer')
var methods = require('methods')
var tv = require('../')
var Layer = tv.Layer
var conf = tv['koa-router']

module.exports = function (router) {
  return function (app) {
    var handler = router(app)

    methods.concat('del').forEach(function (method) {
      // For 5.x+, the methods are on a router, not patched onto the app
      var target = typeof handler[method] === 'function' ? handler : app

      // The method might not exist at all
      if (typeof target[method] !== 'function') return

      shimmer.wrap(target, method, function (fn) {
        return function (url, route) {
          // Define controller/action at assignment time
          var controller = method + ' ' + url
          var action = route.name || '(anonymous)'

          return fn.call(this, url, function* (next) {
            // Check if there is a trace to continue
            var last = Layer.last
            if ( ! last || ! conf.enabled) {
              return yield route.call(this, next)
            }

            // Build controller/action data
            var data = {
              Controller: controller,
              Action: action
            }

            // Assign controller/action to http layer exit
            var exit = this.res._http_layer.events.exit
            exit.Controller = data.Controller
            exit.Action = data.Action

            // Create koa-route profile
            var layer = last.profile(controller + ' ' + action, data)

            // Enter, run and exit
            layer.enter()
            var res = yield route.call(this, next)
            layer.exit()
            return res
          })
        }
      })
    })

    return handler
  }
}
