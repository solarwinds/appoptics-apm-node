'use strict'

const shimmer = require('shimmer')
const methods = require('methods')
const utility = require('../utility')
const ao = require('../')
const Layer = ao.Layer
const conf = ao.probes['koa-route']

module.exports = function (route) {
  methods.concat('del')
    // The method might not exist at all
    .filter(method => typeof route[method] === 'function')
    .forEach(method => patchRoute(route, method))

  return route
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

function patchRoute (route, method) {
  shimmer.wrap(route, method, fn => {
    return function (url, route) {
      // Define controller/action at assignment time
      return fn.call(this, url, patchHandler(
        `${method} ${url}`,
        utility.fnName(route),
        route
      ))
    }
  })
}
