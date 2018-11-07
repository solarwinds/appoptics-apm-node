'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('ximmer')
const semver = require('semver')
const ao = require('..')
const Sanitizer = ao.addon.Sanitizer
const conf = ao.probes.mysql

function noop () {}

module.exports = function (mysql) {
  try {
    const pkg = requirePatch.relativeRequire('mysql/package.json')

    // Things got more complicated in 2.x.x
    if (semver.satisfies(pkg.version, '>= 2.0.0')) {
      const Query = requirePatch.relativeRequire(
        'mysql/lib/protocol/sequences/Query'
      )
      const Connection = requirePatch.relativeRequire(
        'mysql/lib/Connection'
      )
      const Pool = requirePatch.relativeRequire(
        'mysql/lib/Pool'
      )

      // Patch Connection
      {
        const proto = Connection.prototype
        if (proto && Query) patchConnection(proto, Query)
      }

      // Patch Pool
      {
        const proto = Pool.prototype
        if (proto) patchPool(proto)
      }
    } else {
      const Query = semver.satisfies(pkg.version, '>= 0.9.2')
        ? requirePatch.relativeRequire('mysql/lib/query')
        : requirePatch.relativeRequire('mysql/lib/mysql/query')

      // Patch Client
      {
        const proto = mysql.Client && mysql.Client.prototype
        if (proto && Query) patchClient(proto, Query)
      }
    }
  } catch (e) {}

  return mysql
}

function patchPool (proto) {
  if (typeof proto.getConnection !== 'function') return
  shimmer.wrap(proto, 'getConnection', fn => function (...args) {
    if (args.length) args.push(ao.bind(args.pop()))
    return fn.apply(this, args)
  })
}

function wrapEmitter (emitter, done) {
  if (typeof emitter.emit !== 'function') {
    return
  }
  // bind the emitter first to maintain context
  ao.bindEmitter(emitter)
  shimmer.wrap(emitter, 'emit', fn => function (ev, val) {
    switch (ev) {
      case 'error': done(val); break
      case 'end': done(); break
    }
    return fn.apply(this, arguments)
  })
}

// NOTE: This also converts buffers to strings
function trim (n) {
  return arg => {
    if (Buffer.isBuffer(arg) || typeof arg === 'string') {
      return (arg.length > n ? arg.slice(0, n) : arg).toString()
    }
  }
}

function patchConnection (proto, Query) {
  patchClient(proto, Query)

  if (typeof proto.connect !== 'function') {
    ao.loggers.patching('mysql - proto.connect is not a function')
    return
  }
  shimmer.wrap(proto, 'connect', fn => function (...args) {
    if (ao.lastEvent) {
      if (args.length) {
        args.push(ao.bind(args.pop()))
      }
    }
    return fn.apply(this, args)
  })
}

function patchClient (proto, Query) {
  if (typeof proto.query !== 'function') {
    ao.loggers.patching('mysql - proto.query is not a function')
    return
  }
  shimmer.wrap(proto, 'query', fn => function (...args) {
    // Convert args to an array
    const [sql, values] = args
    let cb = noop
    let span

    // Find appropriate callback. Location varies by calling convention
    if (typeof args[args.length - 1] === 'function') {
      cb = args.pop()
    } else if (sql instanceof Query && sql._callback) {
      cb = sql._callback
    }

    return ao.instrument(
      last => {
        // Normalize query/value input styles
        //
        // (query, value)
        // ({ query: '...', value: '...' })
        // (new Query(query, value, callback))
        const Query = typeof sql === 'object' ? sql.sql : sql
        const QueryArgs = typeof values !== 'function' ? values : sql.values

        // Set basic k/v pairs. note that database is defaulted to ''
        // in data object because not all queries' config contains a
        // reference to a database, e.g., "show databases like test"
        const {host, port, database} = this.config || this
        const data = {
          Spec: 'query',
          Flavor: 'mysql',
          RemoteHost: `${host}:${port}`,
          Database: database || '',
          Query
        }

        // Sanitize, if necessary
        if (conf.sanitizeSql) {
          data.Query = Sanitizer.sanitize(
            data.Query,
            Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE
          )

        // Only set QueryArgs when not sanitizing, trimming large values
        // and ensuring buffers are converted to strings
        } else if (QueryArgs) {
          data.QueryArgs = JSON.stringify(
            Array.isArray(QueryArgs)
              ? QueryArgs.map(trim(1000))
              : QueryArgs
          )
        }

        // Truncate long queries
        if (data.Query.length > 2048) {
          data.Query = data.Query.slice(0, 2048).toString()
          data.QueryTruncated = true
        }

        // Run mysql action in span container
        return (span = last.descend('mysql', data))
      },
      done => {
        try {
          // Constructor-style
          if (sql instanceof Query && sql._callback) {
            sql._callback = done

          // Callback-style
          } else if (cb !== noop) {
            args.push(done)
          }

          const ret = fn.apply(this, args)

          // Event-style
          if (cb === noop) {
            wrapEmitter(ret, done)
          }

          return ret
        } catch (err) {
          if (span) span.error(err)
          throw err
        }
      },
      conf,
      cb
    )
  })
}
