'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const sqlTraceContext = require('../sql-trace-context')
const sqlSanitizer = require('../sql-sanitizer')

const conf = ao.probes.tedious
const logMissing = ao.makeLogMissing('tedious')

const semver = require('semver')
let version

module.exports = function (tedious, info) {
  version = info.version

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
    if (ao.tracing) {
      ao.bindEmitter(this)
    }
    return fn.apply(this, arguments)
  })
}

function patchMakeRequest (connection) {
  if (typeof connection.makeRequest !== 'function') {
    logMissing('connection.makeRequest()')
    return
  }
  shimmer.wrap(connection, 'makeRequest', fn => function (...args) {
    /* query and arguments */
    const [request] = args

    // api changed at that specific version...
    const queryStatment = semver.gte(version, '11.0.10') ? request.sqlTextOrProcedure : request.parametersByName.statement.value
    const queryArgs = getQueryArgs(semver.gte(version, '11.0.10') ? request.parameters : request.originalParameters)

    // trace context injection decision
    const injectSql = conf.enabled && conf.tagSql && ao.tracing && ao.sampling(ao.lastEvent)

    /* callback */
    const cb = request.userCallback

    return ao.instrument(
      () => {
        // get host and database info
        const { server, options } = this.config
        const port = options.port ? `:${options.port}` : ''

        // build k/v pair object
        const kvpairs = {
          Spec: 'query',
          Flavor: 'mssql',
          RemoteHost: `${server}${port}`,
          Database: options.database || ''
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
          kvpairs.QueryTruncated = true
          kvpairs.Query = kvpairs.Query.slice(0, 2048).toString()
        }

        return {
          name: 'mssql',
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
          const tag = sqlTraceContext.tag(ao.traceId)
          args[0].sqlTextOrProcedure = `${tag} ${queryStatment}`
        }

        args[0].userCallback = done

        return fn.apply(this, args)
      },
      conf,
      cb
    )
  })
}

function patchConnection (connection) {
  patchDefaultConfig(connection)
  patchMakeRequest(connection)
}

//
// Helpers
//

function getQueryArgs (params) {
  const QueryArgs = {}
  params.forEach(param => {
    // newer versions of package keep params as a buffer.
    // convert to string for kv pair
    QueryArgs[param.name] = Buffer.isBuffer(param.value) ? param.value.toString() : param.value
  })
  return QueryArgs
}
