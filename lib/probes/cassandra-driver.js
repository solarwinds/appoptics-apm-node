var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
var semver = require('semver')
var Layer = require('../layer')
var tv = require('..')
var Sanitizer = tv.addon.Sanitizer
var conf = tv['cassandra-driver']

function argsToArray (args) {
  var length = args.length
  var res = []
  var i = 0
  for (; i < length; i++) {
    res[i] = args[i]
  }
  return res
}

module.exports = function (cassandra) {
  // Create reversed map of consistencies back to their names
  var types = cassandra.types
  var consistencies = {}
  Object.keys(types.consistencies).forEach(function (name) {
    var value = types.consistencies[name]
    if (typeof value === 'number') {
      consistencies[value] = name
    }
  })

  var RequestHandler = requirePatch.relativeRequire('cassandra-driver/lib/request-handler')

  patchRequestHandler(RequestHandler.prototype)
  patchClient(cassandra.Client.prototype, consistencies)

  return cassandra
}

function patchRequestHandler (requestHandler) {
  shimmer.massWrap(requestHandler, [
    'sendOnConnection'
  ], function (method) {
    return function () {
      var args = argsToArray(arguments)
      var last = Layer.last
      if (last) {
        last.info({
          RemoteHost: this.connection.address + ':' + this.connection.port
        })
      }
      return method.apply(this, args)
    }
  })
}

function patchClient (client, consistencies) {
  shimmer.wrap(client, 'connect', function (method) {
    return function () {
      var args = argsToArray(arguments)
      var last = Layer.last
      if (last) {
        args.push(tv.requestStore.bind(args.pop()))
      }
      return method.apply(this, args)
    }
  })

  shimmer.wrap(client, '_innerExecute', function (execute) {
    return function () {
      var args = argsToArray(arguments)
      var cb = args.pop()
      var query = args[0]
      var params = args[1] || []
      var options = args[2] || {}
      if ( ! Array.isArray(params) && typeof params === 'object') {
        options = args[1]
        params = []
      }
      var consistency = options.consistency
      var self = this

      // Skip, if unable to find a trace to continue from
      var last = Layer.last
      if ( ! tv.tracing || ! last) {
        return execute.apply(self, args.concat(cb))
      }

      // If disabled, just bind
      if ( ! conf.enabled) {
        return execute.apply(self, args.concat(tv.requestStore.bind(cb)))
      }

      // Create a hash to store even k/v pairs
      var data = {
        Flavor: 'cql',
        Keyspace: this.options.keyspace,
        ConsistencyLevel: consistencies[consistency] || 'one',
        Query: query
      }

      // Keyspace is planned to be an alternative to Database.
      // For now, Database is a required key, so map it back.
      data.Database = data.Keyspace

      if (params.length && ! conf.sanitizeSql) {
        data.QueryArgs = params

      // If no args list has been supplied, assume the worst...
      } else if (conf.sanitizeSql) {
        data.Query = sanitize(data.Query)
      }

      // Serialize QueryArgs, if available
      if (data.QueryArgs) {
        // Trim large values and ensure buffers are converted to strings
        data.QueryArgs = data.QueryArgs.map(trim(1000))
        data.QueryArgs = JSON.stringify(data.QueryArgs)
      }

      // Truncate long queries
      if (data.Query.length > 2048) {
        data.Query = trim(2048)(data.Query)
        data.QueryTruncated = true
      }

      // Collect backtraces, if configured to do so
      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace()
      }

      // Create and run layer
      var layer = last.descend('cassandra', data)
      return layer.run(function (wrap) {
        args.push(wrap(cb))
        return execute.apply(self, args)
      })
    }
  })

  //
  // Batch queries are handled slightly differently
  //
  shimmer.wrap(client, 'batch', function (execute) {
    return function () {
      var args = argsToArray(arguments)
      var cb = args.pop()
      var queries = args[0]
      var params = args[1] || []
      var options = args[2] || {}
      var consistency = options.consistency
      var self = this

      // Skip, if unable to find a trace to continue from
      var last = Layer.last
      if ( ! tv.tracing || ! last) {
        return execute.apply(self, args.concat(cb))
      }

      // If disabled, just bind
      if ( ! conf.enabled) {
        return execute.apply(self, args.concat(tv.requestStore.bind(cb)))
      }

      // Create a hash to store even k/v pairs
      var data = {
        Flavor: 'cql',
        Keyspace: this.options.keyspace,
        ConsistencyLevel: consistencies[consistency] || 'one',
        Query: 'BATCH'
      }

      // Keyspace is planned to be an alternative to Database.
      // For now, Database is a required key, so map it back.
      data.Database = data.Keyspace

      // Grab query list
      data.BatchQueries = queries.map(mapProp('query'))

      // Sanitize queries, if necessary
      if (conf.sanitizeSql) {
        data.BatchQueries = data.BatchQueries.map(sanitize)

      // And only include QueryArgs when not sanitizing
      } else {
        data.BatchQueryArgs = queries.map(mapProp('params'))
      }

      // Trim values
      data.BatchQueries = data.BatchQueries.map(trim(1000))
      if (data.BatchQueryArgs) {
        data.BatchQueryArgs = data.BatchQueryArgs.map(trim(1000))
      }

      // Serialize
      data.BatchQueries = JSON.stringify(data.BatchQueries)
      if (data.BatchQueryArgs) {
        data.BatchQueryArgs = JSON.stringify(data.BatchQueryArgs)
      }

      // Collect backtraces, if configured to do so
      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace()
      }

      // Create and run layer
      var layer = last.descend('cassandra', data)
      return layer.run(function (wrap) {
        args.push(wrap(cb))
        return execute.apply(self, args)
      })
    }
  })

  // Trim a value, if it exceeds the specified length,
  // and ensure buffers are converted to strings.
  function trim (n) {
    return function (v) {
      return v ? (v.length > n ? v.slice(0, n) : v).toString() : null
    }
  }

  // Helper for mapping to properies
  function mapProp (prop) {
    return function (item) {
      return item[prop]
    }
  }

  function sanitize (query) {
    return Sanitizer.sanitize(query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
  }
}
