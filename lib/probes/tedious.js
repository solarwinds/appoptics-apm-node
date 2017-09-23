'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const conf = ao.tedious
const Sanitizer = ao.addon.Sanitizer

module.exports = function (tedious) {
  const proto = tedious.Connection && tedious.Connection.prototype
  if (proto) patchConnection(proto)
  return tedious
}

function patchDefaultConfig (connection) {
  if (typeof connection.defaultConfig !== 'function') return
  shimmer.wrap(connection, 'defaultConfig', fn => function () {
    ao.bindEmitter(this)
    return fn.apply(this, arguments)
  })
}

function patchMakeRequest (connection) {
  if (typeof connection.makeRequest !== 'function') return
  shimmer.wrap(connection, 'makeRequest', fn => function (...args) {
    const [request] = args
    return ao.instrument(
      last => {
        const query = request.parametersByName.statement.value
        const {server, options: {port, database}} = this.config
        const data = {
          Spec: 'query',
          RemoteHost: `${server}:${port}`,
          Database: database,
          Flavor: 'mssql'
        }

        // Sanitize queries, when configured to do so
        data.Query = conf.sanitizeSql ? sanitize(query) : query

        // Only include QueryArgs when not sanitizing
        if (!conf.sanitizeSql) {
          data.QueryArgs = getQueryArgs(request)
        }

        // Trim long queries
        if (data.Query.length > 1024) {
          data.QueryTruncated = true
          data.Query = trim(1024)(data.Query)
        }

        return last.descend('mssql', data)
      },
      done => {
        args[0].userCallback = done
        return fn.apply(this, args)
      },
      conf,
      request.userCallback
    )
  })
}

function getQueryArgs (request) {
  const QueryArgs = {}
  request.originalParameters.forEach(param => {
    QueryArgs[param.name] = param.value
  })
  return JSON.stringify(QueryArgs)
}

function patchConnection (connection) {
  patchDefaultConfig(connection)
  patchMakeRequest(connection)
}

// Trim a value, if it exceeds the specified length,
// and ensure buffers are converted to strings.
function trim (n) {
  return v => v && (v.length > n ? v.slice(0, n) : v).toString()
}

function sanitize (query) {
  return Sanitizer.sanitize(query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
}
