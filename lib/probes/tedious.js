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
        var QueryArgs = {}

        // Sanitize queries, when configured to do so
        if (conf.sanitizeSql) {
          query = sanitize(query)

        // Only include QueryArgs when not sanitizing
        } else {
          request.originalParameters.forEach(function (param) {
            QueryArgs[param.name] = param.value
          })
        }

        layer = last.descend('mssql', {
          RemoteHost: config.server + ':' + config.options.port,
          Database: config.database,
          Flavor: 'mssql',
          Query: query,
          QueryArgs: JSON.stringify(QueryArgs)
        })

        return layer
      }, function (callback) {
        args[0].userCallback = callback
        fn.apply(connection, args)
      }, conf, request.userCallback)
    }
  })
}

function sanitize (query) {
  return Sanitizer.sanitize(query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
}
