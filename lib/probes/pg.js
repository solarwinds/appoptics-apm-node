'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('ximmer')
const semver = require('semver')
const ao = require('..')
const Sanitizer = ao.addon.Sanitizer
const conf = ao.probes.pg

const logMissing = ao.makeLogMissing('pg')

module.exports = function (postgres) {
  const version = requirePatch.relativeRequire('pg/package.json').version
  //
  // Patch postgres, but only patch the native driver when available
  //
  if (process.env.NODE_PG_FORCE_NATIVE) {
    patchNative(postgres, version)
  } else {
    patchPool(postgres, version)

    const proto = postgres.Client && postgres.Client.prototype
    if (proto) {
      patchClientConnect(proto, version)
      patchClientQuery(proto, version)
    } else {
      logMissing('Client.prototype')
    }

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
      patchClient(proto, version)
    } else {
      logMissing('Client.prototype')
    }

  } else if (typeof pg.Client === 'function') {
    shimmer.wrap(pg, 'Client', fn => function () {
      const client = fn.apply(this, arguments)
      patchClient(client.constructor.prototype, version)
      return client
    })
  } else {
    logMissing('Client()')
  }
}

//
// wrap the pool constructor once Pool is a constructor so that
// the connect function of each pool created can be wrapped.
//
function patchPool (postgres, version) {
  if (semver.lte(version, '6.0.0')) {
    return
  }
  if (typeof postgres.Pool !== 'function') {
    logMissing('Pool()')
    return
  }

  shimmer.wrap(postgres, 'Pool', pool => function (...args) {
    const p = new pool(...args)

    if (typeof p.connect === 'function') {
      const maybeBind = fn => ao.lastEvent ? ao.bind(fn) : fn
      shimmer.wrap(p, 'connect', connect => maybeBind(function (...args) {
        if (ao.lastEvent && typeof args[0] === 'function') {
          args[0] = ao.bind(args[0])
        }
        return connect.apply(this, args)
      }))
    }
    // return the pool with the possibly wrapped connection function.
    return p
  })
}


// Enable context passthrough for Client::connect
function patchClientConnect (client) {
  if (typeof client.connect !== 'function') {
    logMissing('client.connect()')
    return
  }
  // patch the underlying function if it is present
  const fn = typeof client._connect === 'function' ? '_connect' : 'connect'

  shimmer.wrap(client, fn, connect => function (...args) {
    // if context is present and there is a callback bind it
    if (ao.lastEvent && typeof args[0] === 'function') {
      args.push(ao.bind(args.pop()))
    }
    return connect.apply(this, args)
  })
}

function patchClientQuery (client, version) {
  if (typeof client.query !== 'function') {
    logMissing('client.query()')
    return
  }
  shimmer.wrap(client, 'query', query => function (...args) {
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
        if (cb) {
          setCallback(args, done)
        }
        const ret = query.apply(this, args)

        // If no callback was supplied, we're in evented mode or promise mode.
        if (!cb) {
          // if v7 it will return a promise
          if (semver.gte(version, '7.0.0')) {
            // promise mode
            ret.then(() => {
              done(ret)
              return ret
            }).catch(e => {
              done(e)
              throw e
            })
          } else {
            // In version 6 this returns a query instance that is both a promise
            // and an emitter. i'm not sure what to do here.
            //
            // TODO BAM - consider a flag for this closure that keeps track of
            // the done() calls so only one is sent even if the caller subscribes
            // to the end and error events?
            //
            // Patch emit method to report error or end to wrapper
            shimmer.wrap(ret, 'emit', emit => ao.bind(function (type, arg) {
              switch (type) {
                case 'error': done(arg); break
                case 'end': done(arg); break
              }
              return emit.apply(this, arguments)
            }))
          }
        }

        return ret
      },
      conf,
      cb
    )
  })
}

function patchClient (client, version) {
  patchClientConnect(client, version)
  patchClientQuery(client, version)
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
  if (!name) {
    return text
  }

  let stmts = preparedStatements.get(ctx)
  // default the value to the name so there's always something there.
  if (!stmts) {
    stmts = {[name]: name}
    preparedStatements.set(ctx, stmts)
  }

  // Store prepared statement query text for future reference
  if (text) {
    stmts[name] = text
  }

  return stmts[name]
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
