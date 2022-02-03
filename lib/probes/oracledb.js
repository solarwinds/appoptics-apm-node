'use strict'

const shimmer = require('shimmer')
const ao = require('..')

const conf = ao.probes.oracledb
const logMissing = ao.makeLogMissing('oracledb')

const log = ao.loggers

module.exports = function (oracledb) {
  const proto = oracledb.constructor.prototype
  if (proto) {
    patchProto(proto, oracledb)
  } else {
    logMissing('constructor.prototype')
  }

  return oracledb
}

const patchedPools = new WeakMap()

function patchCreatePool (proto, oracledb) {
  if (typeof proto.createPool !== 'function') {
    logMissing('createPool()')
    return
  }
  if (patchedPools.get(proto)) {
    log.debug('oracledb createPool() seems to be patched already')
    return
  }
  patchedPools.set(proto, true)
  shimmer.wrap(proto, 'createPool', fn => function (...args) {
    log.debug('ORACLEDB wrapping createPool')

    // args[0] is a connection object
    // args[1] the query. it is optional.
    // if not provided there will be no instrumentation
    if (ao.lastEvent && typeof args[1] === 'function') {
      // Retain continuation, if we are in one
      const cb = ao.bind(args.pop())

      // Wrap callback so we can patch the connection
      args.push((err, pool) => {
        if (err) {
          return cb(err)
        }
        const proto = pool && pool.constructor.prototype
        if (proto) {
          patchGetConnection(proto, oracledb, args[0])
        } else {
          logMissing('pool.constructor.prototype')
        }
        return cb(null, pool)
      })
    }

    return fn.apply(this, args)
  })
}

const patchedConnections = new WeakMap()

function patchGetConnection (proto, oracledb, options) {
  if (typeof proto.getConnection !== 'function') {
    logMissing('getConnection()')
    return
  }
  if (patchedConnections.get(proto)) {
    log.debug('oracledb getConnection() seems to be patched')
    return
  }
  patchedConnections.set(proto, true)

  shimmer.wrap(proto, 'getConnection', fn => function (...args) {
    log.debug('oracledb wrapping getConnection')

    // args[0] is a connection object
    // args[1] the query. it is optional.
    // if not provided there will be no instrumentation
    if (ao.lastEvent && typeof args[1] === 'function') {
      // Retain continuation, if we are in one
      const cb = ao.bind(args.pop())

      // Wrap callback so we can patch the connection
      args.push(function (err, conn) {
        if (err) {
          return cb(err)
        }
        const proto = conn && conn.constructor.prototype
        if (proto) {
          patchConnection(proto, oracledb, options || args[0])
        } else {
          logMissing('connection.constructor.prototype')
        }
        return cb(null, conn)
      })
    }

    return fn.apply(this, args)
  })
}

function patchConnection (conn, oracledb, options) {
  const methods = [
    'execute',
    'commit',
    'rollback',
    'break'
  ]

  methods.forEach(method => patchMethod(conn, method, oracledb, options))
  patchRelease(conn)
}

const patchedMethods = {}

function patchMethod (conn, method, oracledb, options) {
  if (typeof conn[method] !== 'function') {
    logMissing('connection.' + method + '()')
    return
  }

  // Track if this method of this connection has been patched already
  if (!patchedMethods[method]) {
    patchedMethods[method] = new WeakMap()
  }
  if (patchedMethods[method].get(conn)) {
    log.debug('connection.' + method + '() seems to be patched')
    return
  }
  patchedMethods[method].set(conn, true)

  shimmer.wrap(conn, method, fn => function (...args) {
    /* query and arguments */
    const [queryStatment, queryArgs] = args

    /* callback */
    const cb = args.pop()

    return ao.instrument(
      () => {
        // get host and database info
        const parts = options.connectString.split('/')
        const database = parts.pop()
        const host = parts.pop()

        // build k/v pair object
        const kvpairs = {
          Spec: 'query',
          Flavor: 'oracle',
          RemoteHost: host,
          Database: database || '',
          isAutoCommit: isAutoCommit(oracledb, args) // oracle specific
        }

        // sanitize, if necessary
        kvpairs.Query = conf.sanitizeSql
          ? ao.addon.Sanitizer.sanitize(maybeQuery(method, queryStatment), ao.addon.Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
          : queryStatment

        // only set queryArgs when not sanitizing
        // and ensuring buffers are converted to strings
        if (!conf.sanitizeSql && isArgs(queryArgs)) {
          kvpairs.QueryArgs = JSON.stringify(queryArgs)
        }

        // truncate long queries
        if (kvpairs.Query.length > 2048) {
          kvpairs.Query = kvpairs.Query.slice(0, 2048).toString()
          kvpairs.QueryTruncated = true
        }

        return {
          name: 'oracle',
          kvpairs
        }
      },
      done => {
        fn.apply(this, args.concat(done))
      },
      conf,
      cb
    )
  })
}

const patchedReleases = new WeakMap()

function patchRelease (conn) {
  if (typeof conn.release !== 'function') {
    logMissing('connection.release()')
    return
  }
  if (patchedReleases.get(conn)) {
    log.debug('connection.release seems to be patched')
    return
  }
  patchedReleases.set(conn, true)

  shimmer.wrap(conn, 'release', fn => function (cb) {
    return fn.call(this, ao.bind(cb))
  })
}

function patchProto (proto, oracledb) {
  patchGetConnection(proto, oracledb)
  patchCreatePool(proto, oracledb)
}

//
// Helpers
//

function isArgs (v) {
  return Array.isArray(v) || typeof v === 'object'
}

function isAutoCommit (oracledb, args) {
  return (args.length > 2 && typeof args[2].isAutoCommit !== 'undefined')
    ? args[2].isAutoCommit
    : oracledb.isAutoCommit || false // if undefined, return false which is valid KV value
}

// Some commands, like COMMIT and ROLLBACK are represented as methods,
// so we should use those as the query value when no query is present
function maybeQuery (method, query) {
  return typeof query !== 'string' ? method.toUpperCase() : query
}
