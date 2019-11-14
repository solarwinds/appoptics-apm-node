'use strict'

const shimmer = require('ximmer')
const semver = require('semver');

const ao = require('..')
const utility = require('../utility')
const requirePatch = require('../require-patch');

const logMissing = ao.makeLogMissing('restify');

const conf = ao.probes.restify

// pre v7.0.0
function patchServerHandle (server) {
  if (typeof server._handle !== 'function') {
    logMissing('server._handle()');
    return
  }
  shimmer.wrap(server, '_handle', fn => function (req, res) {
    return ao.instrumentHttp(
      'restify',
      () => fn.apply(this, arguments),
      conf,
      res
    )
  })
}

// v7.0.0+
function patchServerOnRequest (proto) {
  if (typeof proto._onRequest !== 'function') {
    logMissing('Server.prototype._onRequest()');
    return
  }
  shimmer.wrap(proto, '_onRequest', fn => function (req, res) {
    return ao.instrumentHttp(
      'restify',
      () => fn.apply(this, arguments),
      conf,
      res
    )
  })
}

function patchServerMethodArg (method, opts, fn) {
  return function (...args) {
    const [, res] = args

    // Determine controller and action values
    // NOTE: restify has no "controller" concept, use url pattern
    const Controller = `${method.toUpperCase()} ${opts.path || opts}`
    const Action = utility.fnName(fn)

    // Create data object
    const kvpairs = {Controller, Action}

    // Store the latest middleware Controller/Action on exit
    const outer = res._ao_http_span
    if (outer) {
      outer.events.exit.set(kvpairs)
    }

    let span
    return ao.instrumentHttp(
      () => {
        return {
          name: 'restify-route',
          kvpairs,
          finalize (createdSpan) {
            span = createdSpan
          }
        }
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
    logMissing(`server.${method}()`);
    return
  }
  shimmer.wrap(server, method, fn => function (opts, ...args) {
    // Map all args after opts into patcher
    return fn.apply(this, [opts].concat(
      args.map(fn => patchServerMethodArg(method, opts, fn))
    ))
  })
}

function patchServer (server, version) {
  // _handle no longer exists in v7
  if (semver.lt(version, '7.0.0')) {
    patchServerHandle(server);
  }

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

function patchCreateServer (restify, version) {
  if (typeof restify.createServer !== 'function') {
    logMissing('restify.createServer()');
    return
  }
  shimmer.wrap(restify, 'createServer', fn => function () {
    const server = fn.apply(this, arguments)
    patchServer(server, version)
    return server
  })
}

//
// Apply restify patches
//
module.exports = function (restify, options) {
  if (semver.gte(options.version, '7.0.0')) {
    const Server = requirePatch.relReq('restify/lib/server.js');
    if (!Server.prototype) {
      logMissing('Server.prototype');
      return restify;
    }
    // createServer binds _onRequest to the instance this must be patched prior to
    // calling createServer.
    patchServerOnRequest(Server.prototype);
  }
  patchCreateServer(restify, options.version);
  return restify
}
