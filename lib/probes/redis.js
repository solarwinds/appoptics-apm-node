var debug = require('debug')('traceview:probes:redis')
var Layer = require('../layer')
var Event = require('../layer')
var tv = require('..')

function noop () {}

function isFunction (fn) {
  return typeof fn === 'function'
}

function wrapCallback (args) {
  if (isFunction(args[args.length])) {
    return args[args.length]
  }

  if (Array.isArray(args[1]) && isFunction(args[1][args[1].length])) {
    return args[1][args[1].length]
  }
}

module.exports = function (redis) {
  var real_send_command = redis.RedisClient.prototype.send_command

  redis.RedisClient.prototype.send_command = function (command, args, callback) {
    var fnArgs = arguments
    var self = this
    var data = {
      KVOp: command
    }

    var cb = callback || args[args.length - 1]

    if (args.length >= 1 && typeof args[0] !== 'function') {
      data.KVKey = args[0]
    }

    var last = Event.last
    if ( ! last) {
      return real_send_command.apply(self, fnArgs)
    }

    var layer = last.descend('redis', null, data)
    last.async = true

    if (typeof fnArgs[fnArgs.length-1] === 'function') {

    }

    return layer.run(function (done) {
      return real_send_command.apply(self, fnArgs)
    })
  }

  return redis
}
