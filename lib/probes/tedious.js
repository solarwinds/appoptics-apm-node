var requirePatch = require('../require-patch')
var inherits = require('util').inherits
var argsToArray = require('sliced')
var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('..')
var conf = tv.tedious
var Sanitizer = tv.addon.Sanitizer

module.exports = function (tedious) {
  patchConnection(tedious.Connection.prototype)
  return tedious
}

function patchConnection (connection) {
  shimmer.wrap(connection, 'makeRequest', function (fn) {
    return function (request, packetType, payload) {
      var args = argsToArray(arguments)
      var connection = this

      var layer
      tv.instrument(function (last) {
        var query = request.parametersByName.statement.value
        var config = connection.config
        var data = {
          RemoteHost: config.server + ':' + config.options.port,
          Database: config.database,
          Flavor: 'mssql'
        }

        // Sanitize queries, when configured to do so
        if (conf.sanitizeSql) {
          query = sanitize(query)

        // Only include QueryArgs when not sanitizing
        } else {
          var QueryArgs = {}
          request.originalParameters.forEach(function (param) {
            QueryArgs[param.name] = param.value
          })
          data.QueryArgs = JSON.stringify(QueryArgs)
        }

        // Trim long queries
        if (query.length > 2048) {
          data.QueryTruncated = true
          query = trim(1024)(query)
        }

        // Add query
        data.Query = query

        layer = last.descend('mssql', data)

        return layer
      }, function (callback) {
        args[0].userCallback = callback
        fn.apply(connection, args)
      }, conf, request.userCallback)
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
