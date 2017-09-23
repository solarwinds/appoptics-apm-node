'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('shimmer')
const ao = require('..')
const Layer = ao.Layer
const Sanitizer = ao.addon.Sanitizer
const conf = ao['cassandra-driver']

module.exports = function (cassandra) {
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

  const handlerPath = 'cassandra-driver/lib/request-handler'
  let RequestHandler
  try { RequestHandler = requirePatch.relativeRequire(handlerPath) }
  catch (e) {}

  if (RequestHandler) {
    patchRequestHandler(RequestHandler.prototype)
  }
  if (cassandra.Client && cassandra.Client.prototype) {
    patchClient(cassandra.Client.prototype, consistencies)
  }

  return cassandra
}

function patchRequestHandler (requestHandler) {
  if (typeof requestHandler.sendOnConnection !== 'function') return
  shimmer.wrap(requestHandler, 'sendOnConnection', method => function () {
    const last = Layer.last
    if (last && conf.enabled) {
      const { address, port } = this.connection
      last.info({ RemoteHost: `${address}:${port}` })
    }
    return method.apply(this, arguments)
  })
}

function patchClientConnect (client) {
  if (typeof client.connect !== 'function') return
  shimmer.wrap(client, 'connect', method => function (...args) {
    if (args.length) args.push(ao.bind(args.pop()))
    return method.apply(this, args)
  })
}

function normalizeArgs (query, params, options) {
  return [ query, params || [], options || {} ]
}

function serializeList (list) {
  return JSON.stringify(list.map(trim(1000)))
}

function patchClientInnerExecute (client, consistencies) {
  if (typeof client._innerExecute !== 'function') return
  shimmer.wrap(client, '_innerExecute', execute => function (...args) {
    const cb = args.pop()

    return ao.instrument(last => {
      // Handle arguments
      let [ query, params, options ] = normalizeArgs(...args)
      if (!Array.isArray(params) && typeof params === 'object') {
        options = args[1]
        params = []
      }
      const consistency = options.consistency || {}
      const {keyspace} = this.options

      // Sanitize, if configured to do so
      query = conf.sanitizeSql ? sanitize(query) : query

      // Create a hash to store even k/v pairs
      const data = {
        Spec: 'query',
        Flavor: 'cql',
        Keyspace: keyspace,
        // Keyspace is planned to be an alternative to Database.
        // For now, Database is a required key, so map it back.
        Database: keyspace,
        ConsistencyLevel: consistencies[consistency] || 'one',
        Query: query
      }

      // Serialize QueryArgs, if available
      if (!conf.sanitizeSql && params.length) {
        // Trim large values and ensure buffers are converted to strings
        data.QueryArgs = serializeList(params)
      }

      // Truncate long queries
      if (data.Query.length > 2048) {
        data.Query = trim(2048)(data.Query)
        data.QueryTruncated = true
      }

      return last.descend('cassandra', data)
    }, cb => execute.apply(this, args.concat(cb)), conf, cb)
  })
}

//
// Batch queries are handled slightly differently
//
function patchClientBatch (client, consistencies) {
  if (typeof client.batch !== 'function') return
  shimmer.wrap(client, 'batch', fn => function (...args) {
    const cb = args.pop()

    return ao.instrument(last => {
      // Handle arguments
      const [ queries,, {consistency} ] = normalizeArgs(...args)
      const {keyspace} = this.options

      // Create a hash to store even k/v pairs
      const data = {
        Flavor: 'cql',
        Keyspace: keyspace,
        // Keyspace is planned to be an alternative to Database.
        // For now, Database is a required key, so map it back.
        Database: keyspace,
        ConsistencyLevel: consistencies[consistency] || 'one',
        Query: 'BATCH'
      }

      // Grab query list, maybe sanitize, and serialize
      data.BatchQueries = serializeList(maybeSanitizeList(
        queries.map(mapProp('query'))
      ))

      // Only include QueryArgs when not sanitizing
      if (!conf.sanitizeSql) {
        data.BatchQueryArgs = serializeList(queries.map(mapProp('params')))
      }

      return last.descend('cassandra', data)
    }, cb => fn.apply(this, args.concat(cb)), conf, cb)
  })
}

function patchClient (client, consistencies) {
  patchClientConnect(client)
  patchClientInnerExecute(client, consistencies)
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
  return Sanitizer.sanitize(query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
}
