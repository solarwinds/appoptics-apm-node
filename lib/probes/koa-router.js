'use strict'

const shimmer = require('ximmer')
const methods = require('methods')
const utility = require('../utility')
const ao = require('../')
const Span = ao.Span
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

function patchMethod (target, method) {
  // The method might not exist at all
  if (typeof target[method] !== 'function') return

  shimmer.wrap(target, method, fn => {
    return function (url, route) {
      // Define controller/action at assignment time
      return fn.call(this, url, patchHandler(
        method + ' ' + url,
        utility.fnName(route),
        route
      ))
    }
  })
}
