'use strict'

const shimmer = require('ximmer')
const ao = require('..')
const log = ao.loggers
const conf = ao.probes.redis

module.exports = function (redis) {
  const proto = redis.RedisClient && redis.RedisClient.prototype
  if (proto) {
    patchSendCommand(proto)
    patchAddListener(proto)
  } else {
    log.patching('redis - cannot find RedisClient.prototype')
  }
  return redis
}

const skip = {
  subscribe: true,
  publish: true
}

function noop () {}

function lastFn (args) {
  const tail = args[args.length - 1]
  return typeof tail === 'function'
    ? args.pop()
    : Array.isArray(tail)
      ? lastFn(tail)
      : noop
}

function patchSendCommand (client) {
  if (typeof client.send_command !== 'function') {
    log.patching('redis - client.send_command is not a function')
    return
  }
  let isMulti = false
  shimmer.wrap(client, 'send_command', fn => function (...args) {
    const [cmd, values] = args
    const cb = lastFn(args)

    const lowCmd = cmd.toLowerCase()
    if (skip[lowCmd]) {
      return fn.call(this, cmd, values, ao.bind(cb))
    }

    let span, addHit
    return ao.instrument(
      last => {
        // Flag this and future commands as multi
        if (lowCmd === 'multi') {
          isMulti = true
        }

        // Only include KVHit when not in multi
        addHit = !isMulti

        // Exit multi-mode when exec is called, but after deciding addHit
        if (lowCmd === 'exec') {
          isMulti = false
        }

        const {address, host, port} = this
        const data = {
          Spec: 'cache',
          KVOp: lowCmd,
          RemoteHost: address || `${host}:${port}`
        }

        if (lowCmd === 'eval') {
          data.Script = values[0].substr(0, 100)
        } else if (lowCmd !== 'multi' && lowCmd !== 'exec') {
          data.KVKey = values[0]
        }

        return (span = last.descend('redis', data))
      },
      done => fn.call(this, cmd, values, function (err, res) {
        if (span) {
          const {exit} = span.events
          if (err) exit.error = err
          if (addHit) exit.KVHit = !!res
        }
        return done.apply(this, arguments)
      }),
      conf,
      cb
    )
  })
}

function patchAddListener (client) {
  if (typeof client.on !== 'function') {
    log.patching('redis - client.on is not a function')
    return
  }
  shimmer.wrap(client, 'on', fn => function (event, cb) {
    if (event === 'subscribe' || event === 'message') {
      return fn.call(this, event, ao.bind(cb))
    }

    // if it's not subscribe or message then just call the function
    return fn.call(this, event, cb)
  })
}
