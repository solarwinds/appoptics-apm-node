'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const sqlTraceContext = require('../sql-trace-context')

const conf = ao.probes.pg
const logMissing = ao.makeLogMissing('pg')

module.exports = function (postgres, info) {
  // Patch postgres, but only patch the native driver when available
  if (process.env.NODE_PG_FORCE_NATIVE) {
    patchNative(postgres)
  } else {
    patchPool(postgres)

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

function patchNative (pg) {
  const proto = pg.Client && pg.Client.prototype
  if (proto) {
    patchClient(proto)
  } else {
    logMissing('Client.prototype')
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
        if (ao.tracing && typeof args[0] === 'function') {
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
  if (typeof client._connect === 'function') {
    fn = '_connect'
  }

  shimmer.wrap(client, fn, connect => function (...args) {
    // if context is present and there is a callback bind it
    if (ao.tracing && typeof args[0] === 'function') {
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

    // trace context injection decision
    // when type is object - it is a prepared statement
    // do not inject into prepared statements
    const injectSql = conf.enabled && conf.tagSql && ao.tracing && ao.sampling(ao.lastEvent) && typeof query === 'string'

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
          kvpairs,
          finalize (span) {
            if (injectSql) {
              // once we know what the newly created span id is: set it into the QueryTag
              const tag = sqlTraceContext.tag(span.events.entry.toString())
              span.events.entry.set({ QueryTag: tag })
            }
          }
        }
      },
      done => {
        if (cb) {
          setCallback(args, done)
        }

        // note: this is an SQL injection
        if (injectSql) {
          const tag = sqlTraceContext.tag(ao.traceId)
          args[0] = `${tag} ${queryStatment}`
        }

        const ret = fn.apply(this, args)

        // If no callback was supplied, we're in promise mode.
        if (!cb) {
          // promise mode
          ret.then(() => {
            done(ret)
            return ret
          }).catch(e => {
            done(e)
            throw e
          })
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
