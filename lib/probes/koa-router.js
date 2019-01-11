'use strict'

const shimmer = require('ximmer')
const methods = require('methods')
const semver = require('semver')

const utility = require('../utility')
const ao = require('../')
const requirePatch = require('../require-patch')
const Span = ao.Span
const conf = ao.probes['koa-router']

const {version} = requirePatch.relativeRequire('koa-router/package.json')

module.exports = function (_router) {
  if (semver.gte(version, '7.0.0')) {
    // allow the caller to invoke this with or without "new" by
    // not using an arrow function.
    return function () {
      const router = _router.apply(this, arguments)
      wrapRouter(router)
      return router
    }
  }
  return app => patchApp(app, _router)
}

function patchApp (app, router) {
  const handler = router(app)

  methods.concat('del').forEach(method => {
    // For 5.x+, the methods are on a router, not patched onto the app
    //Check if app exists, only use handler otherwise
    patchGeneratorFunction(
      (app ? [handler, app] : [handler]).filter(v => typeof v[method] === 'function')[0],
      method
    )
  })

  return handler
}

function wrapRouter (router) {
  methods.concat('del', 'all').forEach(method => {
    patchAsyncMethod([router].filter(v => typeof v[method] === 'function')[0], method)
  })
}

function patchHandler (Controller, Action, route) {
  return async (ctx, next) => {
    // Check if there is a trace to continue
    const last = Span.last
    if (!last || !conf.enabled) {
      return await route.call(this, ctx, next)
    }

    let span
    try {
      // Build controller/action data, assign to http
      // span exit, and create koa-router profile
      const data = {Controller, Action}
      this.res._ao_http_span.events.exit.set(data)
      span = last.profile(`${Controller} ${Action}`, data)
    } catch (e) {}

    // Enter, run and exit
    if (span) span.enter()
    const res = await route.call(this, ctx, next)
    if (span) span.exit()
    return res
  }
}

function patchGeneratorHandler (Controller, Action, route) {
  return function* (next) {
    // Check if there is a trace to continue
    const last = Span.last
    if (!last || !conf.enabled) {
      return yield route.call(this, next)
    }

    let span
    try {
      // Build controller/action data, assign to http
      // span exit, and create koa-route profile
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

function patchAsyncMethod (target, method) {
  if (typeof target[method] !== 'function') return

  shimmer.wrap(target, method, fn => {
    return function (name, url, route) {
      if (arguments.length === 3) {
        return fn.call(this, name, url, patchHandler(
          method + ' ' + url,
          utility.fnName(route),
          route
        ))
      }
      return fn.call(this, name, patchHandler(
        method + ' ' + name,
        utility.fnName(url),
        url
      ))
    }
  })
}

function patchGeneratorFunction (target, method) {
  // The method might not exist at all
  if (typeof target[method] !== 'function') return

  shimmer.wrap(target, method, fn => {
    return function (url, route) {
      // Define controller/action at assignment time
      return fn.call(this, url, patchGeneratorHandler(
        method + ' ' + url,
        utility.fnName(route),
        route
      ))
    }
  })
}
