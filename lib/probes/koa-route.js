'use strict'

const shimmer = require('ximmer')
const methods = require('methods')
const utility = require('../utility')
const ao = require('../')
const Span = ao.Span
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
    const last = Span.last
    if (!last || !conf.enabled) {
      return yield route.call(this, next)
    }

    let span
    try {
      // Build controller/action data, assign to http
      // span exit, and reate koa-route profile
      const data = {Controller, Action}
      this.res._ao_http_span.events.exit.set(data)
      span = last.profile(`${Controller} ${Action}`, data)
    } catch (e) {}

    // Enter, run and exit
    if (span) span.enter()
    const res = yield route.call(this, next)
    if (span) span.exit()
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
