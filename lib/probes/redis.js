'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const conf = ao.probes.redis

module.exports = function (redis) {
  const proto = redis.RedisClient && redis.RedisClient.prototype
  if (proto) patchSendCommand(proto)
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
  if (typeof client.send_command !== 'function') return
  let isMulti = false
  shimmer.wrap(client, 'send_command', fn => function (...args) {
    const [cmd, values] = args
    const cb = lastFn(args)

    const lowCmd = cmd.toLowerCase()
    if (skip[lowCmd]) {
      return fn.call(this, cmd, values, ao.bind(cb))
    }

    let layer, addHit
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
        } else {
          data.KVKey = values[0]
        }

        return (layer = last.descend('redis', data))
      },
      done => fn.call(this, cmd, values, function (err, res) {
        if (layer) {
          const {exit} = layer.events
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
