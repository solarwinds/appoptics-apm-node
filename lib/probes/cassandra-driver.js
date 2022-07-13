'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const sqlTraceContext = require('../sql-trace-context')
const sqlSanitizer = require('../sql-sanitizer')

const conf = ao.probes['cassandra-driver']
const logMissing = ao.makeLogMissing('cassandra-driver')

const semverSatisfies = require('semver/functions/satisfies')
const requirePatch = require('../require-patch')

module.exports = function (cassandra, info) {
  const version = info.version
  // Create reversed map of consistencies back to their names
  const types = cassandra.types || {}
  const consistencies = {}

  if (types.consistencies) {
    Object.keys(types.consistencies).forEach(name => {
      const value = types.consistencies[name]
      if (typeof value === 'number') {
        consistencies[value] = name
      }
    })
  }

  // not all of these are needed for all versions
  const handlerPath = 'cassandra-driver/lib/request-handler'
  const executionPath = 'cassandra-driver/lib/request-execution'
  const prepareHandlerPath = 'cassandra-driver/lib/prepare-handler'
  // set these to defaults for the most recent version to favor
  // current software
  let sendOnConnection = '_sendOnConnection'
  let connection = '_connection'

  // version 4.4.0 replaced callbacks with async functions internally.
  const asyncInternals = semverSatisfies(version, '>=4.4.0')

  // prior to v3.2.2 need to load request-handler. (sendOnConnection, this.connection)
  // after v3.3.0 need to load request-execution (_sendOnConnection, this._connection)
  if (semverSatisfies(version, '>=3.3.0')) {
    sendOnConnection = '_sendOnConnection'
    connection = '_connection'
  } else if (semverSatisfies(version, '>=3.2.0')) {
    sendOnConnection = '_sendOnConnection'
    connection = 'connection'
  } else {
    sendOnConnection = 'sendOnConnection'
    connection = 'connection'
  }

  let RequestExecution
  let PrepareHandler
  if (semverSatisfies(version, '>=3.3.0')) {
    try {
      RequestExecution = requirePatch.relativeRequire(executionPath)
      PrepareHandler = requirePatch.relativeRequire(prepareHandlerPath)
      // patch after both requires succeed.
      patchSendOnConnection(
        RequestExecution.prototype,
        sendOnConnection,
        connection
      )
      patchPrepareHandler(PrepareHandler, asyncInternals)
    } catch (e) {
      ao.loggers.patching('probe.cassandra-driver failed to patch >=3.3.0')
    }
  } else {
    let RequestHandler
    try {
      RequestHandler = requirePatch.relativeRequire(handlerPath)
      patchSendOnConnection(RequestHandler, sendOnConnection, connection)
    } catch (e) {
      ao.loggers.patching('probe.cassandra-driver could not require', handlerPath)
    }
  }

  if (cassandra.Client && cassandra.Client.prototype) {
    patchClient(cassandra.Client.prototype, consistencies, asyncInternals)
  } else {
    logMissing('Client.prototype')
  }

  return cassandra
}

// send an info event when a connection is made.
function patchSendOnConnection (where, sendName, connName) {
  if (typeof where[sendName] !== 'function') {
    logMissing(sendName + '()')
    return
  }
  shimmer.wrap(where, sendName, method => function () {
    const last = ao.lastSpan
    if (last && conf.enabled && this[connName]) {
      const { address, port } = this[connName]
      last.info({ RemoteHost: `${address}:${port}` })
    }
    return method.apply(this, arguments)
  })
}

function patchPrepareHandler (prepareHandler, asyncInternals) {
  if (typeof prepareHandler.getPrepared !== 'function') {
    logMissing('PrepareHandler.getPrepared()')
    return
  }
  // don't wrap it if it's using async functions internally. context should
  // be propagated through the promise chain.
  if (asyncInternals) {
    return
  }

  shimmer.wrap(prepareHandler, 'getPrepared', cb => function (...args) {
    if (args.length) {
      args.push(ao.bind(args.pop()))
    }
    return cb.apply(this, args)
  })
}

//
// patch connect
//
function patchClientConnect (client) {
  if (typeof client.connect !== 'function') {
    logMissing('client.connect()')
    return
  }
  // client.connect is the exposed function that takes an optional callback.
  // client._connect is the internal async function. if a callback is used
  // the it must be bound to maintain context.
  shimmer.wrap(client, 'connect', method => function (...args) {
    // if there is a callback bind the callback to context if present
    if (args.length && typeof args[args.length - 1] === 'function' && ao.lastEvent) {
      args.push(ao.bind(args.pop()))
    }
    return method.apply(this, args)
  })
}

function normalizeArgs (query, params, options) {
  return [
    query,
    params || [],
    options || {}
  ]
}

//
// patch stream in two ways
// 1) bind the event emitter it returns to the async context.
// 2) if a callback is supplied bind it to the async context.
//
function patchClientStream (client, consistencies) {
  if (typeof client.stream !== 'function') {
    logMissing('client.stream()')
    return
  }
  shimmer.wrap(client, 'stream', stream => function (...args) {
    // if there is a callback bind to context
    if (args.length && typeof args[args.length - 1] === 'function') {
      args.push(ao.bind(args.pop()))
    }
    // bind the emitter that stream returns
    return ao.bindEmitter(stream.apply(this, args))
  })
}

function patchClientExecute (client, consistencies) {
  if (typeof client._execute !== 'function' || client._execute.constructor.name !== 'AsyncFunction') {
    logMissing('client._execute()')
    return
  }
  shimmer.wrap(client, '_execute', execute => function (...args) {
    // trace context injection decision
    const injectSql = conf.enabled && conf.tagSql && ao.tracing && ao.sampling(ao.lastEvent)

    // Handle arguments
    let [queryStatment, queryArgs, options] = normalizeArgs(...args)
    if (!Array.isArray(queryArgs) && typeof queryArgs === 'object') {
      options = args[1]
      queryArgs = []
    }
    const consistency = options.consistency || {}
    const keyspace = this.options.keyspace || ''

    return ao.pInstrument(
      // span info function
      () => {
        // Create a hash to store event k/v pairs
        const kvpairs = {
          Spec: 'query',
          Flavor: 'cql',
          // Keyspace is planned to be an alternative to Database.
          // But Database is a required key, so add it too.
          Keyspace: keyspace,
          Database: keyspace,
          ConsistencyLevel: consistencies[consistency] || 'one'
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
          name: 'cassandra',
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
      () => {
        // note: this is an SQL injection
        if (injectSql) {
          const tag = sqlTraceContext.tag(ao.traceId)
          args[0] = `${tag} ${queryStatment}`
        }
        return execute.apply(this, args)
      },
      conf
    )
  })
}

function patchClientInnerExecute (client, consistencies) {
  if (typeof client._innerExecute !== 'function') {
    logMissing('client._innerExecute()')
    return
  }
  shimmer.wrap(client, '_innerExecute', execute => function (...args) {
    const cb = args.pop()

    // trace context injection decision
    const injectSql = conf.enabled && conf.tagSql && ao.tracing && ao.sampling(ao.lastEvent)

    // Handle arguments
    let [queryStatment, queryArgs, options] = normalizeArgs(...args)
    if (!Array.isArray(queryArgs) && typeof pqueryArgs === 'object') {
      options = args[1]
      queryArgs = []
    }
    const consistency = options.consistency || {}
    const keyspace = this.options.keyspace || ''

    return ao.instrument(
      () => {
        // Create a hash to store event k/v pairs
        const kvpairs = {
          Spec: 'query',
          Flavor: 'cql',
          // Keyspace is planned to be an alternative to Database.
          // But Database is a required key, so add it too.
          Keyspace: keyspace,
          Database: keyspace,
          ConsistencyLevel: consistencies[consistency] || 'one'
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
          name: 'cassandra',
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
      cb => {
        // note: this is an SQL injection
        if (injectSql) {
          const tag = sqlTraceContext.tag(ao.traceId)
          args[0] = `${tag} ${queryStatment}`
        }

        return execute.apply(this, args.concat(cb))
      },
      conf,
      cb
    )
  })
}

//
// Batch queries are handled slightly differently
//
function patchClientBatch (client, consistencies) {
  if (typeof client.batch !== 'function') {
    logMissing('client.batch()')
    return
  }
  shimmer.wrap(client, 'batch', fn => function (...args) {
    const cb = args.pop()

    // trace context injection decision
    const injectSql = conf.enabled && conf.tagSql && ao.tracing && ao.sampling(ao.lastEvent)

    // Handle arguments
    const [queries, , { consistency }] = normalizeArgs(...args)
    const { keyspace } = this.options

    return ao.instrument(
      () => {
        // Create a hash to store event k/v pairs
        const kvpairs = {
          Spec: 'query',
          Flavor: 'cql',
          Query: 'BATCH',
          // Keyspace is planned to be an alternative to Database.
          // But Database is a required key, so add it too.
          Keyspace: keyspace,
          Database: keyspace,
          ConsistencyLevel: consistencies[consistency] || 'one'
        }

        // Grab query list, maybe sanitize, and serialize

        kvpairs.BatchQueries = JSON.stringify(maybeSanitizeList(
          queries.map(mapProp('query'))
        ))

        // Only include QueryArgs when not sanitizing
        if (!conf.sanitizeSql) {
          kvpairs.BatchQueryArgs = JSON.stringify(queries.map(mapProp('params')))
        }

        return {
          name: 'cassandra',
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
        // note: this is an SQL injection
        if (injectSql) {
          queries.forEach(object => {
            const tag = sqlTraceContext.tag(ao.traceId)
            object.query = `${tag} ${object.query}`
          })
        }

        // console.log(args)
        fn.apply(this, args.concat(done))
      },
      // cb => fn.apply(this, args.concat(cb)),
      conf,
      cb
    )
  })
}

function patchClient (client, consistencies, isAsync) {
  patchClientConnect(client)
  // this overloads the meaning of isAsync by presuming the function
  // to patch as well. if that doesn't hold true in the future then
  // consider reworking the patching scheme.
  //
  // >= 4.4.0 _execute: async ƒ (query, params, execOptions)
  // < 4.4.0 _innerExecute: f (query, params, execOptions, callback)
  if (isAsync) {
    patchClientExecute(client, consistencies)
  } else {
    patchClientInnerExecute(client, consistencies)
  }
  patchClientStream(client, consistencies)
  patchClientBatch(client, consistencies)
}

// Helper for mapping to properies
function mapProp (prop) {
  return item => item[prop]
}

function maybeSanitizeList (queries) {
  return conf.sanitizeSql
    ? queries.map(query => sqlSanitizer.sanitize(query))
    : queries
}
