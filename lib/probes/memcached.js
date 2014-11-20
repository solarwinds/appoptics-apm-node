var shimmer = require('shimmer')
var tv = require('..')
var Layer = tv.Layer
var conf = tv.memcached

function isGetter (expected) {
  return !!~['get','gets'].indexOf(expected)
}

module.exports = function (memcached) {
  var lastKey
  shimmer.wrap(memcached.prototype, 'multi', function (multi) {
    return function (keys, fn) {
      lastKey = keys
      return multi.call(this, keys, fn)
    }
  })

  shimmer.wrap(memcached.prototype, 'command', function (command) {
    return function (fn) {
      // Skip if not tracing
      var last = Layer.last
      if ( ! last) {
        return command.call(this, fn)
      }

      // Memcached uses a builder function that returns
      // a query descriptor object. Lets patch that.
      return command.call(this, function () {
        var res = fn()

        // If not enabled, we still need to bind
        if ( ! conf.enabled) {
          res.callback = tv.requestStore.bind(res.callback)
          return res
        }

        // res.key is not present on multi calls, so use lastKey
        var key = res.key || lastKey

        // Define entry event data
        var data = {
          KVOp: res.type,
          KVKey: key
        }

        if (res.multi) {
          data.KVKey = JSON.stringify(data.KVKey)
        }

        // Collect backtraces, if configured to do so
        if (conf.collectBacktraces) {
          data.Backtrace = tv.backtrace()
        }

        // Create the layer and run
        var layer = last.descend('memcached', data)
        return layer.run(function (wrap) {
          // Alternate patcher for getters. This add KVHit data,
          // but also requires that errors are handled manually.
          function reportHits (cb) {
            return tv.requestStore.bind(function (err, val) {
              if (err) {
                layer.events.exit.error = err
              }

              if (res.multi) {
                layer.exit({
                  KVKeyCount: key.length,
                  KVHitCount: Object.keys(val).length
                })
              } else {
                layer.exit({
                  KVHit: typeof val !== 'undefined' && val !== false
                })
              }
              return cb.apply(this, arguments)
            })
          }

          // If using a getter, patch to include KVHit
          if (isGetter(res.type)) {
            res.callback = reportHits(res.callback)
          } else {
            res.callback = wrap(res.callback)
          }

          return res
        })
      })
    }
  })

  return memcached
}
