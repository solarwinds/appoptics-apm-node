'use strict'

const shimmer = require('shimmer')
const methods = require('methods')
const util = require('../util')
const ao = require('../')
const Layer = ao.Layer
const conf = ao.probes['koa-router']

module.exports = function (router) {
  return app => patchApp(app, router)
}

function patchApp (app, router) {
  const handler = router(app)

  methods.concat('del').forEach(method => {
    // For 5.x+, the methods are on a router, not patched onto the app
    //Check if app exists, only use handler otherwise
    patchMethod(
      (app ? [handler, app] : [handler]).filter(v => typeof v[method] === 'function')[0],
      method
    )
  })

  return handler
}

function patchHandler (Controller, Action, route) {
  return function* (next) {
    // Check if there is a trace to continue
    const last = Layer.last
    if (!last || !conf.enabled) {
      return yield route.call(this, next)
    }

    let layer
    try {
      // Build controller/action data, assign to http
      // layer exit, and reate koa-route profile
      const data = { Controller, Action }
      this.res._http_layer.events.exit.set(data)
      layer = last.profile(`${Controller} ${Action}`, data)
    } catch (e) {}

    // Enter, run and exit
    if (layer) layer.enter()
    const res = yield route.call(this, next)
    if (layer) layer.exit()
    return res
  }
}

function patchMethod (target, method) {
  // The method might not exist at all
  if (typeof target[method] !== 'function') return

  shimmer.wrap(target, method, fn => {
    return function (url, route) {
      // Define controller/action at assignment time
      return fn.call(this, url, patchHandler(
        method + ' ' + url,
        util.fnName(route),
        route
      ))
    }
  })
}
