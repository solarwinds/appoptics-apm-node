'use strict'

const requirePatch = require('../require-patch')
const WeakMap = require('es6-weak-map')
const shimmer = require('shimmer')
const semver = require('semver')
const ao = require('..')
const log = ao.loggers
const Sanitizer = ao.addon.Sanitizer
const conf = ao.probes.pg

module.exports = function (postgres) {
  const {version} = requirePatch.relativeRequire('pg/package.json')

  //
  // Patch postgres, but only patch the native driver when available
  //
  if (process.env.NODE_PG_FORCE_NATIVE) {
    patchNative(postgres, version)
  } else {
    const proto = postgres.Client && postgres.Client.prototype
    if (proto) patchClient(proto)

    const origGetter = postgres.__lookupGetter__('native')
    delete postgres.native
    postgres.__defineGetter__('native', () => {
      const temp = origGetter()
      patchNative(temp, version)
      return temp
    })
  }

  return postgres
}

// Yes, this is really necessary. Before 4.x, pg used a builder function
// to construct a client rather than exposing the constructor directly.
function patchNative (pg, version) {
  if (semver.satisfies(version, '>= 4.0.0')) {
    const proto = pg.Client && pg.Client.prototype
    if (proto) {
      patchClient(proto)
    } else {
      log.patching('pg - patchNative no prototype')
    }

  } else if (typeof pg.Client === 'function') {
    shimmer.wrap(pg, 'Client', fn => function () {
      const client = fn.apply(this, arguments)
      patchClient(client.constructor.prototype)
      return client
    })
  }
}

// Enable context passthrough for Client::connect
function patchClientConnect (client) {
  if (typeof client.connect !== 'function') {
    log.patching('pg - client.connect not a function: ', typeof client.connect)
    return
  }
  shimmer.wrap(client, 'connect', connect => function (...args) {
    return connect.apply(this, args.concat(ao.bind(args.pop())))
  })
}

function patchClientQuery (client) {
  if (typeof client.query !== 'function') {
    log.patching('pg - client.query not a function: ', typeof client.query)
    return
  }
  shimmer.wrap(client, 'query', query => function (...args) {
    log.debug('pg - patchClientQuery args', args)
    const cb = getCallback(args)

    return ao.instrument(
      last => {
        const [qString, qArgs] = args

        // Create a hash to store event k/v pairs
        const {host, port, database} = this
        const data = {
          Spec: 'query',
          Flavor: 'postgresql',
          RemoteHost: `${host}:${port}`,
          Database: database,
          Query: maybeSanitize(
            typeof qString === 'object'
              ? getPreparedStatement(this, qString)
              : qString
          )
        }

        // Include query args, if supplied, trimming long values,
        // ensuring buffers are converted to strings, and serializing as json
        if (!conf.sanitizeSql) {
          const args = maybeQueryArgs(qString, qArgs)
          if (Array.isArray(args)) {
            data.QueryArgs = JSON.stringify(args.map(trim(1000)))
          }
        }

        // Truncate long queries
        if (data.Query.length > 2048) {
          data.Query = data.Query.slice(0, 2048).toString()
          data.QueryTruncated = true
        }

        return last.descend('postgres', data)
      },
      done => {
        if (cb) setCallback(args, done)
        const ret = query.apply(this, args)

        // If no callback was supplied, we're in evented mode
        // Patch emit method to report error or end to wrapper
        if (!cb) {
          ao.loggers.debug('in pg.evented %l', ao.lastSpan)
          shimmer.wrap(ret, 'emit', emit => ao.bind(function (type, arg) {
            ao.loggers.debug('in pg.evented.wrapped %s', type)
            switch (type) {
              case 'error': done(arg); break
              case 'end': done(arg); break
            }
            return emit.apply(this, arguments)
          }))
        }

        return ret
      },
      conf,
      cb
    )
  })
}

function patchClient (client) {
  patchClientConnect(client)
  patchClientQuery(client)
}

//
// Helpers
//

function trim (n) {
  return arg => (arg.length > n ? arg.slice(0, n) : arg).toString()
}

function getCallback (args) {
  const [qString] = args
  const cb = typeof qString.callback === 'function'
    ? qString.callback
    : typeof args[args.length - 1] === 'function' ? args.pop() : null

  return cb
}

function setCallback (args, cb) {
  const [qString] = args
  if (typeof qString.callback === 'function') {
    qString.callback = cb
  } else {
    args.push(cb)
  }
  return args
}

const preparedStatements = new WeakMap()
function getPreparedStatement (ctx, {name, text}) {
  // Plain query
  if (!name) return text

  let stmts = preparedStatements.get(ctx)
  if (!stmts) {
    stmts = {}
    preparedStatements.set(ctx, stmts)
  }

  // Store prepared statement query text for future reference
  if (text) {
    stmts[name] = text
    return text

  // Get stored prepared statement query text, if needed
  } else {
    return stmts[name]
  }
}

function maybeSanitize (query) {
  return conf.sanitizeSql
    ? Sanitizer.sanitize(query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
    : query
}

function maybeQueryArgs (a, b) {
  if (typeof a === 'object' && a.values) {
    return a.values
  } else if (0 === ~['function', 'undefined'].indexOf(typeof b)) {
    return b
  }
}
