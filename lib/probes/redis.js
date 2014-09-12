var debug = require('debug')('traceview:probes:redis')
var shimmer = require('shimmer')
var Layer = require('../layer')
var Event = require('../layer')
var tv = require('..')

function argsToArray (args) {
  var length = args.length
  var res = []
  var i = 0
  for (; i < length; i++) {
    res[i] = args[i]
  }
  return res
}

var skip = {
  subscribe: true,
  publish: true
}

module.exports = function (redis) {
  var isMulti = false
  shimmer.wrap(redis.RedisClient.prototype, 'send_command', function (fn) {
    return function (cmd, values, callback) {
      var args = argsToArray(arguments)
      var last = args.length - 1
      var tail = args[last]

      if (typeof tail === 'function') {
        callback = args.pop()
      } else if (Array.isArray(tail) && typeof tail[tail.length - 1] === 'function') {
        callback = tail.pop()
      } else {
        callback = function () {}
      }

      var run = fn.bind(this, cmd, values)

      var last = Layer.last
      if ( ! tv.tracing || ! last) {
        return run(callback)
      }

      cmd = cmd.toLowerCase()

      if (skip[cmd]) {
        return run(tv.requestStore.bind(callback))
      }

      // Flag this and future commands as multi
      if (cmd === 'multi') {
        isMulti = true
      }

      // Only include KVHit when not in multi
      var addHit = !isMulti

      // Exit multi-mode when exec is called, but after deciding addHit
      if (cmd === 'exec') {
        isMulti = false
      }

      var data = {
        KVOp: cmd,
        RemoteHost: this.address || this.host + ':' + this.port
      }

      if (cmd === 'eval') {
        data.Script = values[0].substr(0, 100)
      } else {
        data.KVKey = values[0]
      }

      var layer = last.descend('redis', data)
      return layer.run(function (wrap) {
        return run(tv.requestStore.bind(function (err, res) {
          if (err) {
            layer.events.exit.error = err
          }
          var data = {}
          if (addHit) {
            data.KVHit = !!res
          }
          layer.exit(data)
          return callback.call(this, err, res)
        }))
      })
    }
  })

  return redis
}
