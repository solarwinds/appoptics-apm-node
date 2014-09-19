var debug = require('debug')('traceview:probes:pg')
var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('..')
var Sanitizer = tv.addon.Sanitizer
var conf = tv.pg

function argsToArray (args) {
  var length = args.length
  var res = []
  var i = 0
  for (; i < length; i++) {
    res[i] = args[i]
  }
  return res
}

module.exports = function (postgres) {
  requirePatch.disable()
  var pkg = require('pg/package.json')
  requirePatch.enable()

  tv.versions['Node.Postgres.Version'] = pkg.version

  //
  // Patch postgres, but only patch the native driver when available
  //
  if (process.env.NODE_PG_FORCE_NATIVE) {
    patchNative(postgres)
  } else {
    patchClient(postgres.Client.prototype)
    var origGetter = postgres.__lookupGetter__('native')
    delete postgres.native
    postgres.__defineGetter__('native', function () {
      var temp = origGetter()
      patchNative(temp)
      return temp
    })
  }

  return postgres
}

function patchNative (pg) {
  shimmer.wrap(pg, 'Client', function (Client) {
    return function () {
      var client = Client.apply(this, arguments)
      patchClient(client.__proto__)
      return client
    }
  })
}

function noop () {}

function patchClient (client) {
  shimmer.wrap(client, 'query', function (query) {
    return function (qString, qArgs, cb) {
      var self = this

      // Make sure callbacks get wrapped, if available
      function wrapCallback (wrap) {
        if (typeof qString.callback == 'function') {
          qString.callback = wrap(qString.callback)
        } else if (typeof cb === 'function') {
          cb = wrap(cb)
        } else if (typeof qArgs === 'function') {
          qArgs = wrap(qArgs)
        } else {
          return false
        }

        return true
      }

      // Call the real method and ensure context continuation
      function call (wrap) {
        var hasCallback = wrapCallback(wrap)

        var ret = query.call(self, qString, qArgs, cb)

        // If no callback was supplied, we're in evented mode
        // Patch emit method to report error or end to wrapper
        if ( ! hasCallback) {
          shimmer.wrap(ret, 'emit', function (emit) {
            return function (type, arg) {
              switch (type) {
                case 'error': wrap(noop)(arg); break
                case 'end': wrap(noop)(); break
              }
              return emit.apply(this, arguments)
            }
          })
        }

        return ret
      }

      // Skip, if unable to find a trace to continue from
      var last = Layer.last
      if ( ! tv.tracing || ! last) {
        return query.call(this, qString, qArgs, cb)
      }

      // If disabled, just bind
      if ( ! conf.enabled) {
        return call(tv.requestStore.bind.bind(tv.requestStore))
      }

      // Create a hash to store even k/v pairs
      var data = {
        Flavor: 'postgresql',
        RemoteHost: this.host + ':' + this.port,
        Database: this.database
      }

      // Interpret qString argument as a query definition object
      if (typeof qString === 'object') {
        if (qString.name) {
          // Store prepared statement query text for future reference
          if (qString.text) {
            this._tv_preparedStatementMap = this._tv_preparedStatementMap || {}
            this._tv_preparedStatementMap[this.name] = qString.text
            data.Query = qString.text

          // Get stored prepared statement query text, if needed
          } else {
            data.Query = this._tv_preparedStatementMap[this.name]
          }
        } else {
          data.Query = qString.text
        }

        // Include query args, if supplied
        if (qString.values && ! conf.sanitizeSql) {
          data.QueryArgs = qString.values

        // If no args list has been supplied, assume the worst...
        } else if (conf.sanitizeSql) {
          data.Query = Sanitizer.sanitize(data.Query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
        }
      }

      // Interpret qString argument as a string
      if (typeof qString === 'string') {
        data.Query = qString
        if (typeof qArgs !== 'function' && ! conf.sanitizeSql) {
          data.QueryArgs = qArgs

        // If no args list has been supplied, assume the worst...
        } else if (conf.sanitizeSql) {
          data.Query = Sanitizer.sanitize(data.Query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
        }
      }

      // Serialize QueryArgs, if available
      if (data.QueryArgs) {
        // Trim large values and ensure buffers are converted to strings
        data.QueryArgs = data.QueryArgs.map(function (arg) {
          return (arg.length > 1000 ? arg.slice(0, 1000) : arg).toString()
        })
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

      // Create and run layer
      return last.descend('postgres', data).run(call)
    }
  })

  shimmer.wrap(client, 'connect', function (connect) {
    return function () {
      var args = argsToArray(arguments)
      var cb = args.pop()
      args.push(tv.requestStore.bind(cb))
      return connect.apply(this, args)
    }
  })
}
