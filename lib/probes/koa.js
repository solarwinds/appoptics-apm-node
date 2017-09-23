'use strict'

const shimmer = require('shimmer')
const Layer = require('../layer')
const ao = require('../')
const conf = ao.koa

module.exports = koa => {
  return () => {
    const app = koa()
    wrapApp(app)
    return app
  }
}

// Wrap the callback method that goes into listen(...)
function wrapApp (app) {
  if (!app.callback) return
  shimmer.wrap(app, 'callback', callback => {
    return function () {
      const handle = callback.call(this)
      return function (req, res) {
        // Check if there is a trace to continue
        const last = Layer.last
        if (!last || !conf.enabled) {
          return handle.call(this, req, res)
        }

        // Create and enter koa layer
        const layer = last.descend('koa')
        wrapEnd(layer, res)
        layer.enter()

        // Run real handler
        return handle.call(this, req, res)
      }
    }
  })
}

// Exit koa layer and response write
function wrapEnd (layer, res) {
  if (!res.end) return
  shimmer.wrap(res, 'end', realEnd => {
    return function () {
      layer.exit()
      return realEnd.apply(this, arguments)
    }
  })
}
