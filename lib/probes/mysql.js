'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const sqlTraceContext = require('../sql-trace-context')
const sqlSanitizer = require('../sql-sanitizer')

const conf = ao.probes.mysql
const logMissing = ao.makeLogMissing('mysql')

const requirePatch = require('../require-patch')

function noop () {}

module.exports = function (mysql, info) {
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
    if (proto && Query) {
      patchConnection(proto, Query)
    } else {
      logMissing('Connection.prototype')
    }
  }

  // Patch Pool
  {
    const proto = Pool.prototype
    if (proto) {
      patchPool(proto)
    } else {
      logMissing('Pool.prototype')
    }
  }

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

function patchConnection (proto, Query) {
  patchClient(proto, Query)

  if (typeof proto.connect !== 'function') {
    ao.loggers.patching('mysql - proto.connect is not a function')
    return
  }
  shimmer.wrap(proto, 'connect', fn => function (...args) {
    if (ao.tracing) {
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
    /* query and arguments */
    const [query, values] = args

    const queryStatment = typeof query === 'object' ? query.sql : query
    const queryArgs = typeof values !== 'function' ? values : query.values

    // trace context injection decision
    const injectSql = conf.enabled && conf.tagSql && ao.tracing && ao.sampling(ao.lastEvent)

    /* callback */
    let cb = noop
    // Find appropriate callback. Location varies by calling convention
    if (typeof args[args.length - 1] === 'function') {
      cb = args.pop()
    } else if (query instanceof Query && query._callback) {
      cb = query._callback
    }

    return ao.instrument(
      () => {
        // get host and database info
        const { host, port, database } = this.config || this

        // build k/v pair object
        const kvpairs = {
          Spec: 'query',
          Flavor: 'mysql',
          RemoteHost: `${host}:${port}`,
          Database: database || ''
        }

        // sanitize, if necessary
        kvpairs.Query = conf.sanitizeSql
          ? sqlSanitizer.sanitize(queryStatment)
          : queryStatment

        // only set queryArgs when not sanitizing
        // and ensuring buffers are converted to strings
        if (!conf.sanitizeSql && queryArgs) {
          kvpairs.QueryArgs = JSON.stringify(queryArgs)
        }

        // truncate long queries
        if (kvpairs.Query.length > 2048) {
          kvpairs.Query = kvpairs.Query.slice(0, 2048).toString()
          kvpairs.QueryTruncated = true
        }

        return {
          name: 'mysql',
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
        // Constructor-style
        if (query instanceof Query && query._callback) {
          query._callback = done

        // Callback-style
        } else if (cb !== noop) {
          args.push(done)
        }

        // note: this is an SQL injection
        if (injectSql) {
          const tag = sqlTraceContext.tag(ao.traceId)
          if (typeof query === 'object') { args[0].sql = `${tag} ${queryStatment}` }
          if (typeof query === 'string') { args[0] = `${tag} ${queryStatment}` }
        }
        const ret = fn.apply(this, args)

        // Event-style
        if (cb === noop) {
          wrapEmitter(ret, done)
        }

        return ret
      },
      conf,
      cb
    )
  })
}
