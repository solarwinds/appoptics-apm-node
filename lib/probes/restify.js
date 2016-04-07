'use strict'

const shimmer = require('shimmer')
const util = require('../util')
const tv = require('..')
const conf = tv.restify

function patchServerHandle (server) {
  if (typeof server._handle !== 'function') return
  shimmer.wrap(server, '_handle', fn => function (req, res) {
    return tv.instrumentHttp(
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

    let layer
    return tv.instrumentHttp(
      last => {
        // Determine controller and action values
        // NOTE: express has no "controller" concept, url pattern will suffice
        const Controller = `${method.toUpperCase()} ${opts.path || opts}`
        const Action = util.fnName(fn)

        // Create data object
        const data = { Controller, Action }

        // Store the latest middleware Controller/Action on exit
        const outer = res._http_layer
        if (outer) {
          outer.events.exit.set(data)
        }

        // Create profile for this route function
        return (layer = last.profile(`${Controller} ${Action}`, data))
      },
      () => {
        try {
          if (layer) {
            const {exit} = layer
            layer.exit = util.once(() => exit.call(layer))
            args.push(util.before(
              args.pop(),
              () => layer.exit()
            ))
          }
        } catch (e) {}
        return fn.apply(this, args)
      },
      conf,
      res
    )
  }
}

function patchServerMethod (server, method) {
  if (typeof server[method] !== 'function') return
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
  if (typeof restify.createServer !== 'function') return
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
