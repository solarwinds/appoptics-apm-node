'use strict'

const shimmer = require('shimmer')
const ao = require('..')

const conf = ao.probes.pg
const logMissing = ao.makeLogMissing('pg')

const semver = require('semver')
let version

module.exports = function (postgres, info) {
  version = info.version

  // Patch postgres, but only patch the native driver when available
  if (process.env.NODE_PG_FORCE_NATIVE) {
    patchNative(postgres)
  } else {
    if (semver.gte(version, '7.0.0')) {
      patchPool(postgres, version)
    }

    const proto = postgres.Client && postgres.Client.prototype
    if (proto) {
      patchClient(proto)
    } else {
      logMissing('Client.prototype')
    }

    const origGetter = postgres.__lookupGetter__('native')
    delete postgres.native
    postgres.__defineGetter__('native', () => {
      const temp = origGetter()
      patchNative(temp)
      return temp
    })
  }

  return postgres
}

// Yes, this is really necessary. Before 4.x, pg used a builder function
// to construct a client rather than exposing the constructor directly.
function patchNative (pg) {
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
// wrap the pool constructor so the connect function of each pool
// created can be wrapped.
//
function patchPool (postgres) {
  if (typeof postgres.Pool !== 'function') {
    logMissing('Pool()')
    return
  }

  shimmer.wrap(postgres, 'Pool', pool => function (...args) {
    const p = new pool(...args) // eslint-disable-line new-cap

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
  let fn = 'connect'
  if (semver.gte(version, '7.0.0') && typeof client._connect === 'function') {
    fn = '_connect'
  }

  shimmer.wrap(client, fn, connect => function (...args) {
    // if context is present and there is a callback bind it
    if (ao.lastEvent && typeof args[0] === 'function') {
      args.push(ao.bind(args.pop()))
    }
    return connect.apply(this, args)
  })
}

function patchClientQuery (client) {
  if (typeof client.query !== 'function') {
    logMissing('client.query()')
    return
  }
  shimmer.wrap(client, 'query', fn => function (...args) {
    /* query and arguments */
    const [query, queryArgs] = args
    const queryStatment = typeof query === 'object' ? getPreparedStatement(this, query) : query

    /* callback */
    const cb = getCallback(args)

    return ao.instrument(
      () => {
        // get host and database info
        const { host, port, database } = this

        // build k/v pair object
        const kvpairs = {
          Spec: 'query',
          Flavor: 'postgresql',
          RemoteHost: `${host}:${port}`,
          Database: database || ''
        }

        // sanitize, if necessary
        kvpairs.Query = conf.sanitizeSql
          ? ao.addon.Sanitizer.sanitize(queryStatment, ao.addon.Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
          : queryStatment

        // only set queryArgs when not sanitizing, trimming large values
        // and ensuring buffers are converted to strings
        const args = typeof query === 'object' ? query.values : (queryArgs && typeof queryArgs !== 'function') ? queryArgs : undefined
        if (!conf.sanitizeSql && args) {
          kvpairs.QueryArgs = JSON.stringify(args)
        }

        // truncate long queries
        if (kvpairs.Query.length > 2048) {
          kvpairs.QueryTruncated = true
          kvpairs.Query = kvpairs.Query.slice(0, 2048).toString()
        }

        return {
          name: 'postgres',
          kvpairs
        }
      },
      done => {
        if (cb) {
          setCallback(args, done)
        }

        const ret = fn.apply(this, args)

        // If no callback was supplied, we're in promise mode.
        if (!cb) {
          // if v7 it will return a promise. this check results in not supporting
          // promises in v6; the reason is that doing so could cause results to
          // be signaled via a combination of promise, event, and callback. so
          // adding this for v7 leaves v6 in the same state as it was before.
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
            // In v6 the returned query instance is both a promise and an emitter.
            // and can make a callback. figuring out how to handle all three without
            // creating extra events will require some experimentation so i'm leaving
            // it the way it was.
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

function patchClient (client) {
  patchClientConnect(client)
  patchClientQuery(client)
}

//
// Helpers
//

function getCallback (args) {
  const [query] = args
  const cb = typeof query.callback === 'function'
    ? query.callback
    : typeof args[args.length - 1] === 'function' ? args.pop() : null

  return cb
}

function setCallback (args, cb) {
  const [query] = args
  if (typeof query.callback === 'function') {
    query.callback = cb
  } else {
    args.push(cb)
  }
  return args
}

const preparedStatements = new WeakMap()

function getPreparedStatement (ctx, { name, text }) {
  // Plain query
  if (!name) {
    return text
  }

  let stmts = preparedStatements.get(ctx)
  // default the value to the name so there's always something there.
  if (!stmts) {
    stmts = { [name]: name }
    preparedStatements.set(ctx, stmts)
  }

  // Store prepared statement query text for future reference
  if (text) {
    stmts[name] = text
  }

  return stmts[name]
}
