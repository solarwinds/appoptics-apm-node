'use strict'

const shimmer = require('ximmer')
const utility = require('../utility')
const ao = require('..')
const conf = ao.probes.restify

function patchServerHandle (server) {
  if (typeof server._handle !== 'function') {
    return
  }
  shimmer.wrap(server, '_handle', fn => function (req, res) {
    return ao.instrumentHttp(
      last => last.descend('restify'),
      () => fn.apply(this, arguments),
      conf,
      res
    )
  })
}

function patchServerMethodArg (method, opts, fn) {
  return function (...args) {
    const [, res] = args

    let span
    return ao.instrumentHttp(
      last => {
        // Determine controller and action values
        // NOTE: restify has no "controller" concept, use url  pattern
        const Controller = `${method.toUpperCase()} ${opts.path || opts}`
        const Action = utility.fnName(fn)

        // Create data object
        const data = {Controller, Action}

        // Store the latest middleware Controller/Action on exit
        const outer = res._ao_http_span
        if (outer) {
          outer.events.exit.set(data)
        }

        // Create profile for this route function
        return (span = last.profile(`${Controller} ${Action}`, data))
      },
      () => {
        try {
          if (span) {
            const {exit} = span
            span.exit = utility.once(() => exit.call(span))
            args.push(utility.before(
              args.pop(),
              () => span.exit()
            ))
          }
        } catch (e) {
          ao.loggers.error('error in restify runner', e)
        }
        return fn.apply(this, args)
      },
      conf,
      res
    )
  }
}

function patchServerMethod (server, method) {
  if (typeof server[method] !== 'function') {
    return
  }
  shimmer.wrap(server, method, fn => function (opts, ...args) {
    // Map all args after opts into patcher
    return fn.apply(this, [opts].concat(
      args.map(fn => patchServerMethodArg(method, opts, fn))
    ))
  })
}

function patchServer (server) {
  patchServerHandle(server)

  const methods = [
    'del',
    'get',
    'head',
    'opts',
    'post',
    'put',
    'patch'
  ]

  methods.forEach(method => patchServerMethod(server, method))
}

function patchCreateServer (restify) {
  if (typeof restify.createServer !== 'function') {
    return
  }
  shimmer.wrap(restify, 'createServer', fn => function () {
    const server = fn.apply(this, arguments)
    patchServer(server)
    return server
  })
}

//
// Apply restify patches
//
module.exports = function (restify) {
  patchCreateServer(restify)
  return restify
}
