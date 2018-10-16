'use strict'

const debug = require('debug')('appoptics:probes:express')
const requirePatch = require('../require-patch')
const flatten = require('array-flatten')
const WeakMap = require('es6-weak-map')
const shimmer = require('ximmer')
const methods = require('methods')
const semver = require('semver')
const utility = require('../utility')
//const rum = require('../rum')
const ao = require('..')
const log = ao.loggers
const conf = ao.probes.express

//
// Patch routing system to profile each routing function
//
function routeProfiling (express, version) {

  function buildSpan (last, req, res, func) {
    const httpSpan = res._ao_http_span

    // previous
    //   const Controller = req.route.path
    //   const Action = func.name || '(anonymous)'
    let Controller
    let Action

    if (conf.legacyTxname) {
      // old way of setting these
      Controller = req.route.path
      Action = func.name || 'anonymous'
    } else {
      // new way
      Controller = 'express.' + (func.name || 'anonymous')
      Action = req.method + req.route.path
    }

    let txname

    // if a custom transaction name function has been supplied
    // use it.
    if (conf.customNameFunc) {
      res._ao_metrics.customNameFuncCalls += 1
      try {
        txname = conf.customNameFunc(req, res)
      } catch (e) {
        log.error('express customNameFunc() error:', e)
      }
    }

    // if no custom name function or it failed or returned null-like,
    // supply the default name.
    if (!txname) {
      txname = `${Controller}.${Action}`
    }
    res._ao_metrics.txname = txname

    // Store the latest middleware Controller/Action on exit
    const data = {Controller, Action}
    httpSpan.events.exit.set(data)
    return last.profile(`${Controller} ${Action}`, data)
  }

  //
  // Each routing callback is patched individually as a profile
  //
  function profiledRoute (func) {
    return function (req, res, next) {
      let span
      return ao.instrumentHttp(
        last => (span = buildSpan(last, req, res, func)),
        () => {
          // Create wrapper to only send exit once
          try {
            if (span) {
              shimmer.wrap(span, 'exit', utility.once)
              arguments[2] = function () {
                span.exit()
                return next.apply(this, arguments)
              }
            } else if (ao.probes.express.enabled) {
              // the build function will never be called by instrumentHttp if
              // the probe is disabled.
              log.error('express.profiledRoute failed to build span')
            }
          } catch (e) {
            log.error('express.profiledRoute failed to patch span exit')
          }
          return func.apply(this, arguments)
        },
        conf,
        res
      )
    }
  }

  //
  // Patch express 3.x style apps
  //
  function v3 (express) {
    const proto = express.Router && express.Router.prototype
    if (!proto || typeof proto.route !== 'function') {
      log.patching('express.v3 Router.route not a function')
      return
    }
    shimmer.wrap(proto, 'route', fn => function (method) {
      const ret = fn.apply(this, arguments)
      const routes = ret.map ? ret.map[method.toLowerCase()] : []
      const route = routes[routes.length - 1]
      if (route && Array.isArray(route.callbacks)) {
        route.callbacks = route.callbacks.map(profiledRoute)
      }
      return ret
    })
  }

  //
  // Patch express 4.x style apps
  //
  function v4 (express) {
    const proto = express.Route && express.Route.prototype
    if (!proto) {
      log.patching('express.v4 Route.prototype not found')
      return
    }
    methods.concat('all').forEach(method => {
      if (typeof proto[method] !== 'function') {
        log.patching('express.v4 Route.%s not a function', method)
        return
      }
      shimmer.wrap(proto, method, method => function (...args) {
        return method.apply(this, flatten(args).map(profiledRoute))
      })
    })
  }

  //
  // Use appropriate patch for express version
  //
  if (semver.satisfies(version, '>=4.0.0')) {
    v4(express)
  } else {
    v3(express)
  }
}


//
// Patch rendering system to profile render calls
//
function renderProfiling (express, version) {

  //
  // The View constructor is patched to report render timing
  //
  const patchedViews = new WeakMap()
  function patchView (proto) {
    if (typeof proto.render !== 'function') return
    if (patchedViews.get(proto)) return
    patchedViews.set(proto, true)

    shimmer.wrap(proto, 'render', render => {
      return function (...args) {
        return ao.instrument(
          last => {
            return last.descend('express-render', {
              TemplateFile: this.name,
              TemplateLanguage: this.ext,

              // TODO: Disable for now. Maybe include behind config flag later.
              // Locals: JSON.stringify(options || {})
            })
          },
          (callback) => render.apply(this, args.concat(callback)),
          conf,
          typeof args[args.length - 1] === 'function' ? args.pop() : noop
        )
      }
    })
  }

  // Skip instrumentation on old versions
  if (semver.satisfies(version, '< 3.2.0')) {
    debug(`express ${version} does not support render spans`)
    return
  }

  // The View constructor needs to be patched to trace render calls,
  // but is only accessible after defaultConfiguration is called.
  shimmer.wrap(express.application, 'defaultConfiguration', fn => function () {
    const ret = fn.apply(this)
    const View = this.get('view')
    const proto = View && View.prototype
    if (proto) patchView(proto)
    return ret
  })
}

// NOTE: For express 4.x the 'handle' method is in express.application,
// while for 3.x it is actually in connect itself.
function patchHandle (app) {
  if (typeof app.handle !== 'function') {
    log.patching('express.patchHandle app.handle not a function')
    return
  }
  shimmer.wrap(app, 'handle', handle => function (req, res, next) {
    return ao.instrumentHttp(
      'express',
      () => handle.call(this, req, res, next),
      conf,
      res
    )
  })
}

//
// Patch app.handle() to create express span
//
function expressSpan (express) {
  function createApplication () {
    const app = express()
    patchHandle(app)
    return app
  }

  // Copy properties to createApplication proxy function
  for (const i in express) {
    createApplication[i] = express[i]
  }

  return createApplication
}

function noop () {}

//
// Apply express patches
//
module.exports = function (express) {
  const {version} = requirePatch.relativeRequire('express/package.json')

  // Wrap everything in express inside an express span
  express = expressSpan(express)

  // Profile each route callback
  routeProfiling(express, version)

  // Profile render calls
  renderProfiling(express, version)

  return express
}
