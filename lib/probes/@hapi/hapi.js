'use strict'

const ao = global[Symbol.for('SolarWinds.Apm.Once')]
const path = require('path')

const requirePatch = require(path.resolve(ao.root, 'lib', 'require-patch'))
const shimmer = require('shimmer')

const utility = require(path.resolve(ao.root, 'lib', 'utility'))
const log = ao.loggers
const conf = ao.probes['@hapi/hapi']

const notFunction = 'hapi - %s is not a function'

// v17+ uses patchHandler
function patchHandler (handler) {
  if (typeof handler.execute !== 'function') {
    log.patching(notFunction, 'handler.execute')
    return
  }

  shimmer.wrap(handler, 'execute', execute => function (request) {
    // iam:: v17 handler patch
    const { res } = request.raw
    return ao.instrumentHttp(
      () => {
        ao.addResponseFinalizer(res, ao.bind(() => {
          const { exit } = res._ao_http_span.events

          exit.kv.Controller = 'hapi.' + (utility.fnName(request.route.settings.handler) || '(anonymous)')
          exit.kv.Action = request.route.method + request.route.path

          // generate a transaction name
          let txname

          // if a custom transaction name function has been supplied use it.
          if (conf.customNameFunc) {
            res._ao_metrics.customNameFuncCalls += 1
            try {
              // seems like passing hapi's request object is the right thing
              // to do for hapi users. req and res are in the request.raw object.
              txname = conf.customNameFunc(request)
            } catch (e) {
              log.error('hapi customNameFunc() error:', e)
            }
          }

          // if no custom name function or it failed or returned null-like,
          // supply the default name.
          if (!txname) {
            txname = `${exit.kv.Controller}.${exit.kv.Action}`
          }
          res._ao_metrics.txname = txname
        }))
        return { name: 'hapi' }
      },
      // make this right for execute. it doesn't return a value but
      // this function must so that hapi won't set request.response
      // to null.
      function () {
        const r = execute.bind(request, request)()
        // if it's already a promise just return it. this is
        // emulating being an async function.
        if (r.then) {
          return r
        }
        return Promise.resolve(request)
      },
      conf,
      res
    )
  })
}

//
// Apply hapi patches
//
module.exports = function (hapi, options) {
  const { name, version } = options

  // v17 has completely different implementation. handler needs to be patched
  // where before v17 request needed to be patched.
  let handler
  try {
    handler = requirePatch.relativeRequire(`${name}/lib/handler`)
  } catch (e) {
    log.patching('Failed to load hapi/lib/handler')
  }

  if (handler) {
    patchHandler(handler)
  }

  return [hapi, version]
}
