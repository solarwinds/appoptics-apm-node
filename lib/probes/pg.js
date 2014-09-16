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

function patchClient (client) {
  shimmer.wrap(client, 'query', function (query) {
    return function (qString, qArgs, cb) {
      var self = this

      // Call the real method and ensure context continuation
      function call (wrap) {
        // Wrap the callback, wherever it may be
        if (typeof qString.submit == 'function') {
          qString.callback = wrap(qString.callback)
        } else if (typeof cb === 'function') {
          cb = wrap(cb)
        } else {
          cb = wrap(qArgs)
        }

        return query.call(self, qString, qArgs, cb)
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
        data.QueryArgs = JSON.stringify(data.QueryArgs)
      }

      // Collect backtraces, if configured to do so
      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace()
      }

      // Create and run layer
      var layer = last.descend('postgres', data)
      return layer.run(call)
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
