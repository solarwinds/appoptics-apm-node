'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('shimmer')
const semverSatisfies = require('semver/functions/satisfies')
const ao = require('..')
const sqlSanitizer = require('../sql-sanitizer')

const conf = ao.probes['cassandra-driver']
const logMissing = ao.makeLogMissing('cassandra-driver')

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

function serializeList (list) {
  return JSON.stringify(list.map(trim(1000)))
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
    const spanInfo = {
      name: 'cassandra',
      kvpairs: {
        Spec: 'query',
        Flavor: 'cql'
      }
    }

    return ao.pInstrument(
      // span info function
      last => {
        // Handle arguments
        let [query, params, options] = normalizeArgs(...args)
        if (!Array.isArray(params) && typeof params === 'object') {
          options = args[1]
          params = []
        }
        const consistency = options.consistency || {}
        const keyspace = this.options.keyspace || ''

        // Sanitize, if configured to do so
        query = conf.sanitizeSql ? sanitize(query) : query

        // Create a hash to store event k/v pairs
        const kvpairs = spanInfo.kvpairs
        // Keyspace is planned to be an alternative to Database.
        // But Database is a required key, so add it too.
        kvpairs.Keyspace = keyspace
        kvpairs.Database = keyspace
        kvpairs.ConsistencyLevel = consistencies[consistency] || 'one'
        kvpairs.Query = query

        // Serialize QueryArgs, if available
        if (!conf.sanitizeSql && params.length) {
          // Trim large values and ensure buffers are converted to strings
          kvpairs.QueryArgs = serializeList(params)
        }

        // Truncate long queries
        if (kvpairs.Query.length > 2048) {
          kvpairs.Query = trim(2048)(kvpairs.Query)
          kvpairs.QueryTruncated = true
        }

        return spanInfo
      },
      () => execute.apply(this, args),
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
    const spanInfo = {
      name: 'cassandra',
      kvpairs: {
        Spec: 'query',
        Flavor: 'cql'
      }
    }

    return ao.instrument(
      last => {
        // Handle arguments
        let [query, params, options] = normalizeArgs(...args)
        if (!Array.isArray(params) && typeof params === 'object') {
          options = args[1]
          params = []
        }
        const consistency = options.consistency || {}
        const keyspace = this.options.keyspace || ''

        // Sanitize, if configured to do so
        query = conf.sanitizeSql ? sanitize(query) : query

        // Create a hash to store even k/v pairs
        const kvpairs = spanInfo.kvpairs
        // Keyspace is planned to be an alternative to Database.
        // But Database is a required key, so add it too.
        kvpairs.Keyspace = keyspace
        kvpairs.Database = keyspace
        kvpairs.ConsistencyLevel = consistencies[consistency] || 'one'
        kvpairs.Query = query

        // Serialize QueryArgs, if available
        if (!conf.sanitizeSql && params.length) {
          // Trim large values and ensure buffers are converted to strings
          kvpairs.QueryArgs = serializeList(params)
        }

        // Truncate long queries
        if (kvpairs.Query.length > 2048) {
          kvpairs.Query = trim(2048)(kvpairs.Query)
          kvpairs.QueryTruncated = true
        }

        return spanInfo
      },
      cb => {
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

    const spanInfo = {
      name: 'cassandra',
      kvpairs: {
        Flavor: 'cql',
        Query: 'BATCH'
      }
    }

    return ao.instrument(
      () => {
        // Handle arguments
        const [queries, , { consistency }] = normalizeArgs(...args)
        const { keyspace } = this.options

        const kvpairs = spanInfo.kvpairs
        kvpairs.Keyspace = keyspace
        kvpairs.Database = keyspace
        kvpairs.ConsistencyLevel = consistencies[consistency] || 'one'

        // Grab query list, maybe sanitize, and serialize
        kvpairs.BatchQueries = serializeList(maybeSanitizeList(
          queries.map(mapProp('query'))
        ))

        // Only include QueryArgs when not sanitizing
        if (!conf.sanitizeSql) {
          kvpairs.BatchQueryArgs = serializeList(queries.map(mapProp('params')))
        }

        return spanInfo
      },
      cb => fn.apply(this, args.concat(cb)),
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

// Trim a value, if it exceeds the specified length,
// and ensure buffers are converted to strings.
function trim (n) {
  return v => v && (v.length > n ? v.slice(0, n) : v).toString()
}

// Helper for mapping to properies
function mapProp (prop) {
  return item => item[prop]
}

function maybeSanitizeList (queries) {
  return conf.sanitizeSql
    ? queries.map(sanitize)
    : queries
}

function sanitize (query) {
  return sqlSanitizer.sanitize(query)
}
