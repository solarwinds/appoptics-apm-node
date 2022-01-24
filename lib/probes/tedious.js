'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const conf = ao.probes.tedious
const Sanitizer = ao.addon.Sanitizer

const logMissing = ao.makeLogMissing('tedious')

const semver = require('semver')
const pkg = require('tedious/package.json')

module.exports = function (tedious) {
  const proto = tedious.Connection && tedious.Connection.prototype
  if (proto) {
    patchConnection(proto)
  } else {
    logMissing('Connection.prototype')
  }
  return tedious
}

function patchDefaultConfig (connection) {
  // find a function that the constructor calls so that
  // bindEmitter can be used on the 'this' returned by
  // the constructor. this was originally defaultConfig()
  // but that went away back in 2016.
  const functions = ['createDebug', 'defaultConfig']
  let f
  for (let i = 0; i < functions.length; i++) {
    if (typeof connection[functions[i]] === 'function') {
      f = functions[i]
      break
    }
  }
  if (!f) {
    logMissing('connection.[createDebug, defaultConfig]()')
    return
  }

  shimmer.wrap(connection, f, fn => function () {
    ao.bindEmitter(this)
    return fn.apply(this, arguments)
  })
}

function patchMakeRequest (connection) {
  if (typeof connection.makeRequest !== 'function') {
    logMissing('connection.makeRequest()')
    return
  }
  shimmer.wrap(connection, 'makeRequest', fn => function (...args) {
    const [request] = args
    return ao.instrument(
      () => {
        // api changed at that specific version...
        const query = semver.gte(pkg.version, '11.0.10') ? request.sqlTextOrProcedure : request.parametersByName.statement.value

        const { server, options } = this.config
        const port = options.port ? `:${options.port}` : ''
        const kvpairs = {
          Spec: 'query',
          RemoteHost: `${server}${port}`,
          Flavor: 'mssql'
        }
        if (options.database) {
          kvpairs.Database = options.database
        }

        // Sanitize queries, when configured to do so
        kvpairs.Query = conf.sanitizeSql ? sanitize(query) : query

        // Only include QueryArgs when not sanitizing
        if (!conf.sanitizeSql) {
          // api changed at that specific version...
          kvpairs.QueryArgs = getQueryArgs(semver.gte(pkg.version, '11.0.10') ? request.parameters : request.originalParameters)
        }

        // Trim long queries
        if (kvpairs.Query.length > 1024) {
          kvpairs.QueryTruncated = true
          kvpairs.Query = trim(1024)(kvpairs.Query)
        }

        return { name: 'mssql', kvpairs }
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

function getQueryArgs (params) {
  const QueryArgs = {}
  params.forEach(param => {
    // newer versions of package keep params as a buffer.
    // convert to string for kv pair
    QueryArgs[param.name] = Buffer.isBuffer(param.value) ? param.value.toString() : param.value
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
