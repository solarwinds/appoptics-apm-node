var argsToArray = require('sliced')
var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('..')
var conf = tv.oracledb
var Sanitizer = tv.addon.Sanitizer

module.exports = function (oracledb) {
  patchProto(oracledb.__proto__, oracledb)
  return oracledb
}

function patchProto (proto, oracledb) {
  patchGetConnection(proto, oracledb)

  shimmer.wrap(proto, 'createPool', function (fn) {
    return function () {
      var args = argsToArray(arguments)
      var cb = args.pop()

      // Retain continuation, if we are in one
      if (Layer.last) {
        cb = tv.requestStore.bind(cb)
      }

      // Wrap callback so we can patch the connection
      args.push(function (err, pool) {
        if (err) return cb(err)
        patchGetConnection(pool.__proto__, oracledb, args[0])
        return cb(null, pool)
      })

      return fn.apply(this, args)
    }
  })
}

function patchGetConnection (proto, oracledb, options) {
  shimmer.wrap(proto, 'getConnection', function (fn) {
    return function () {
      var args = argsToArray(arguments)
      var cb = args.pop()

      // Retain continuation, if we are in one
      if (Layer.last) {
        cb = tv.requestStore.bind(cb)
      }

      // Wrap callback so we can patch the connection
      args.push(function (err, conn) {
        if (err) return cb(err)
        patchConnection(conn.__proto__, oracledb, options || args[0])
        return cb(null, conn)
      })

      return fn.apply(this, args)
    }
  })
}

function patchConnection (conn, oracledb, options) {
  var methods = [
    'execute',
    'commit',
    'rollback',
    'break'
  ]

  methods.forEach(function (method) {
    shimmer.wrap(conn, method, function (fn) {
      return function (query, queryArgs) {
        var args = argsToArray(arguments)
        var cb = args.pop()
        var self = this
        var layer

        return tv.instrument(function (last) {
          // Parse host and database from connectString
          var parts = options.connectString.split('/')
          var database = parts.pop()
          var host = parts.pop()

          // Build k/v pair object
          var data = {
            RemoteHost: host,
            Database: database,
            Flavor: 'oracle',

            // Report auto-commit status of each query
            isAutoCommit: isAutoCommit(oracledb, args)
          }

          // Methods other than execute have implicit query names
          if (typeof query !== 'string') {
            query = method.toUpperCase()
          } else {
            // Sanitize queries, when configured to do so
            if (conf.sanitizeSql) {
              query = sanitize(query)

            // Only include QueryArgs when not sanitizing
            } else if (isArgs(queryArgs)) {
              data.QueryArgs = JSON.stringify(queryArgs)
            }

            // Trim long queries
            if (query.length > 1024) {
              data.QueryTruncated = true
              query = trim(1024)(query)
            }
          }

          // Add query
          data.Query = query

          layer = last.descend('oracle', data)

          return layer
        }, function (done) {
          return fn.apply(self, args.concat(done))
        }, conf, cb)
      }
    })
  })

  // Patch release method to keep continuation
  shimmer.wrap(conn, 'release', function (fn) {
    return function (cb) {
      // Retain continuation, if we are in one
      if (Layer.last) {
        cb = tv.requestStore.bind(cb)
      }

      return fn.call(this, cb)
    }
  })
}

// Trim a value, if it exceeds the specified length,
// and ensure buffers are converted to strings.
function trim (n) {
  return function (v) {
    return v ? (v.length > n ? v.slice(0, n) : v).toString() : null
  }
}

function sanitize (query) {
  return Sanitizer.sanitize(query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
}

function isArgs (v) {
  return Array.isArray(v) || typeof v == 'object'
}

function isAutoCommit (oracledb, args) {
  return (args.length > 2  && typeof args[2].isAutoCommit !== 'undefined')
    ? args[2].isAutoCommit
    : oracledb.isAutoCommit
}
