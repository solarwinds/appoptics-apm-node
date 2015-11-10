var shimmer= require('shimmer')
var Layer = require('../layer')
var util = require('../util')
var tv = require('..')
var conf = tv.director

/**
 * NOTE: The insert method calls itself recursively, but we only care about
 * the outer call, so this unpatches while executing the original function.
 */
function wrapAndUnwrap (obj, method, replacer) {
  var original = obj[method]
  var alt = obj[method] = replacer(wrapped)

  function wrapped () {
    obj[method] = original
    var ret = original.apply(this, arguments)
    obj[method] = alt
    return ret
  }
}

module.exports = function (director) {
  wrapAndUnwrap(director.http.Router.prototype, 'insert', function (insert) {
    return function (method, pathParts, route, parent) {
      var delimiter = this.delimiter
      function wrap (handler) {
        return function () {
          // Check if we've stored an http layer to hook into
          var httpLayer = this.res._http_layer
          var last = Layer.last
          if ( ! httpLayer || ! last || ! conf.enabled) {
            return handler.apply(this, arguments)
          }

          var controller = '/' + pathParts.join(delimiter)
          var action = util.fnName(handler)

          // Store the latest middleware Controller/Action on exit
          var exit = httpLayer.events.exit
          exit.Controller = controller
          exit.Action = action

          // Prepare data
          var data = {
            Controller: controller,
            Action: action
          }

          // Add backtrace, when enabled
          if (conf.collectBacktraces) {
            data.Backtrace = tv.backtrace()
          }

          // Create profile layer
          var layer = last.profile(controller + ' ' + action, data)

          // We need to use manual mode
          layer.enter()

          // The exit point of the middleware may be res.end()
          // TODO: Figure out a better way then patching for every middleware
          shimmer.wrap(this.res, 'end', function (realEnd) {
            return function () {
              layer.exit()
              return realEnd.apply(this, arguments)
            }
          })

          return handler.apply(this, arguments)
        }
      }

      route = Array.isArray(route) ? route.map(wrap) : wrap(route)

      return insert.call(this, method, pathParts, route, parent)
    }
  })

  shimmer.wrap(director.http.Router.prototype, 'dispatch', function (dispatch) {
    return function (req, res, handler) {
      var last = Layer.last
      if ( ! last || ! conf.enabled) {
        return dispatch.call(this, req, res, handler)
      }

      // Create empty data object
      var data = {}

      // Add backtrace, when enabled
      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace()
      }

      // Descend layer from last layer
      var layer = last.descend('director', data)

      // We need to use manual mode
      layer.enter()

      // The exit point of the middleware may be res.end()
      // TODO: Figure out a better way then patching for every middleware
      shimmer.wrap(res, 'end', function (realEnd) {
        return function () {
          layer.exit()
          return realEnd.apply(this, arguments)
        }
      })

      return dispatch.call(this, req, res, handler)
    }
  })

  return director
}
