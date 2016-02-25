var requirePatch = require('../require-patch')
var argsToArray = require('sliced')
var shimmer = require('shimmer')
var semver = require('semver')
var Layer = require('../layer')
var tv = require('..')
var Sanitizer = tv.addon.Sanitizer
var conf = tv.mysql

function noop () {}

module.exports = function (mysql) {
  var pkg = requirePatch.relativeRequire('mysql/package.json')
  var Connection
  var Query
  var Pool

  // Things got more complicated in 2.x.x
  if (semver.satisfies(pkg.version, '>= 2.0.0')) {
    Query = requirePatch.relativeRequire('mysql/lib/protocol/sequences/Query')
    Connection = requirePatch.relativeRequire('mysql/lib/Connection')
    Pool = requirePatch.relativeRequire('mysql/lib/Pool')
    patchConnection(Connection.prototype, Query)
    patchPool(Pool.prototype)
  } else if (semver.satisfies(pkg.version, '>= 0.9.2')) {
    Query = requirePatch.relativeRequire('mysql/lib/query')
    patchClient(mysql.Client.prototype, Query)
  } else {
    Query = requirePatch.relativeRequire('mysql/lib/mysql/query')
    patchClient(mysql.Client.prototype, Query)
  }

  return mysql
}

function patchPool (pool) {
  shimmer.wrap(pool, 'getConnection', function (fn) {
    return function () {
      var args = argsToArray(arguments)
      if (tv.tracing) {
        args.push(tv.requestStore.bind(args.pop()))
      }
      return fn.apply(this, args)
    }
  })
}

function patchQuery (fn, Query) {
  return function (sql, values) {
    // If there is no continuation, just run normally
    var last = Layer.last
    if ( ! last) {
      return fn.apply(this, arguments)
    }

    // Convert args to an array
    var args = argsToArray(arguments)
    var self = this
    var layer

    // There are several different ways to call query(),
    // with a callback, with a Query constructor which
    // includes a callback, or as a stream.
    //
    // This normalizes all these patterns into one runner.
    function runner (wrap) {
      try {
        // Callback-style
        if (typeof args[args.length - 1] === 'function') {
          args.push(wrap(args.pop()))
          return fn.apply(self, args)
        }

        // Constructor-style
        if (sql instanceof Query && args[0]._callback) {
          args[0]._callback = wrap(args[0]._callback)
          return fn.apply(self, args)
        }

        // Event-style
        var ret = fn.apply(self, args)
        shimmer.wrap(ret, 'emit', function (emit) {
          return function (ev, val) {
            switch (ev) {
              case 'error': wrap(noop)(val); break
              case 'end': wrap(noop)(); break
            }
            return emit.apply(this, arguments)
          }
        })
        return ret
      } catch (err) {
        layer.info({ error: err })
        throw err
      }
    }

    // If mysql instrumentation is off, just bind to request continuation
    if ( ! conf.enabled) {
      return runner(tv.requestStore.bind.bind(tv.requestStore))
    }

    // Normalize query/value input styles
    //
    // (query, value)
    // ({ query: '...', value: '...' })
    // (new Query(query, value, callback))
    var options = typeof sql === 'object' ? sql : { sql: sql }
    if (values && typeof values !== 'function') {
      options.values = values
    }

    // Set basic k/v pairs
    var cfg = this.config || this
    var data = {
      Spec: 'query',
      Flavor: 'mysql',
      RemoteHost: cfg.host + ':' + cfg.port,
      Database: cfg.database
    }

    // Set Query k/v pair, and sanitize, if necessary
    data.Query = options.sql
    if (conf.sanitizeSql) {
      data.Query = Sanitizer.sanitize(data.Query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)

      // Only set QueryArgs when not sanitizing
    } else if (options.values) {
      data.QueryArgs = options.values
    }

    // Serialize QueryArgs, if available
    if (data.QueryArgs) {
      if (Array.isArray(data.QueryArgs)) {
        // Trim large values and ensure buffers are converted to strings
        data.QueryArgs = data.QueryArgs.map(function (arg) {
          if (Buffer.isBuffer(arg) || typeof arg === 'string') {
            return (arg.length > 1000 ? arg.slice(0, 1000) : arg).toString()
          }
        })
      }
      data.QueryArgs = JSON.stringify(data.QueryArgs)
    }

    // Truncate long queries
    if (data.Query.length > 2048) {
      data.Query = data.Query.slice(0, 2048).toString()
      data.QueryTruncated = true
    }

    // Collect backtraces, if configured to do so
    if (conf.collectBacktraces) {
      data.Backtrace = tv.backtrace()
    }

    // Run mysql action in layer container
    layer = last.descend('mysql', data)
    return layer.run(runner)
  }
}

function patchConnection (conn, Query) {
  shimmer.wrap(conn, 'connect', function (fn) {
    return function () {
      var args = argsToArray(arguments)
      if (args.length) {
        var cb = args.pop()
        if (typeof cb === 'function') {
          cb = tv.requestStore.bind(cb)
        }
        args.push(cb)
      }
      return fn.apply(this, args)
    }
  })

  patchClient(conn, Query)
}

function patchClient (client, Query) {
  shimmer.wrap(client, 'query', function (fn) {
    return patchQuery(fn, Query)
  })
}
