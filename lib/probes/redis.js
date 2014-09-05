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

      if (skip[cmd]) {
        return run(tv.requestStore.bind(callback))
      }

      var data = {
        KVOp: cmd.toLowerCase(),
        KVKey: values[0],
        RemoteHost: this.address || this.host + ':' + this.port
      }

      var layer = last.descend('redis', data)
      return layer.run(function (wrap) {
        return run(tv.requestStore.bind(function (err, res) {
          layer.exit({ KVHit: !!res })
          return callback.call(this, err, res)
        }))
      })
    }
  })

  return redis
}
