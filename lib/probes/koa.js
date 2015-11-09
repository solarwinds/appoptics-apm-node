var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('../')
var conf = tv.koa

module.exports = function (koa) {
  return function () {
    var app = koa()

    // Wrap the callback method that goes into listen(...)
    shimmer.wrap(app, 'callback', function (callback) {
      return function (handler) {
        var handle = callback.call(this)

        return function (req, res) {
          // Check if there is a trace to continue
          var last = Layer.last
          if ( ! last || ! conf.enabled) {
            return handle.call(this, req, res)
          }

          // Create and enter koa layer
          var layer = last.descend('koa')
          layer.enter()

          // Exit koa layer and response write
          shimmer.wrap(res, 'end', function (realEnd) {
            return function () {
              layer.exit()
              return realEnd.apply(this, arguments)
            }
          })

          // Run real handler
          return handle.call(this, req, res)
        }
      }
    })

    return app
  }
}
