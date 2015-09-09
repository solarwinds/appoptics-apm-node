var argsToArray = require('sliced')
var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('..')
var conf = tv.redis

module.exports = function (redis) {
  patchSendCommand(redis.RedisClient.prototype, {
    subscribe: true,
    publish: true
  })
  return redis
}

function patchSendCommand (client, skip) {
  var isMulti = false
  shimmer.wrap(client, 'send_command', function (fn) {
    return function (cmd, values, callback) {
      var args = argsToArray(arguments)
      var tail = args[args.length - 1]

      if (typeof tail === 'function') {
        callback = args.pop()
      } else if (Array.isArray(tail) && typeof tail[tail.length - 1] === 'function') {
        callback = tail.pop()
      } else {
        callback = function () {}
      }

      var run = fn.bind(this, cmd, values)

      var last = Layer.last
      if ( ! last) {
        return run(callback)
      }

      cmd = cmd.toLowerCase()

      if ( ! conf.enabled || skip[cmd]) {
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
        Spec: 'cache',
        KVOp: cmd,
        RemoteHost: this.address || this.host + ':' + this.port
      }

      if (cmd === 'eval') {
        data.Script = values[0].substr(0, 100)
      } else {
        data.KVKey = values[0]
      }

      // Collect backtraces, if configured to do so
      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace()
      }

      var layer = last.descend('redis', data)
      return layer.run(function (wrap) {
        return run(wrap(callback, function (err, res) {
          if (err) {
            layer.events.exit.error = err
          }

          var data = {}
          if (addHit) {
            data.KVHit = !!res
          }
          layer.exit(data)
        }))
      })
    }
  })
}
