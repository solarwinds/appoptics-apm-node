'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const conf = ao.probes.redis

const logMissing = ao.makeLogMissing('redis')

module.exports = function (redis) {
  const proto = redis.RedisClient && redis.RedisClient.prototype
  if (proto) {
    patchSendCommand(proto)
    patchAddListener(proto)
  } else {
    logMissing('RedisClient.prototype')
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
  let isMulti = false
  //
  // wrap internal_send_command if it's present. if not, wrap send_command, if
  // neither log a message and return.
  //
  if (typeof client.internal_send_command === 'function') {

    shimmer.wrap(client, 'internal_send_command', fn => function (cmdObj) {
      // send_command args
      const {command, args, callback} = cmdObj

      const lcCmd = command.toLowerCase()
      if (skip[lcCmd]) {
        if (ao.lastEvent) {
          cmdObj.callback = ao.bind(callback)
        }
        return fn.call(this, cmdObj)
      }

      // Flag this and future commands as multi
      if (lcCmd === 'multi') {
        isMulti = true
      }

      // Only include KVHit when not in multi
      const addHit = !isMulti

      // Exit multi-mode when exec is called, but after deciding addHit
      if (lcCmd === 'exec') {
        isMulti = false
      }

      const {address, host, port} = this
      const kvpairs = {
        Spec: 'cache',
        KVOp: lcCmd,
        RemoteHost: address || `${host}:${port}`
      }

      if (lcCmd === 'eval') {
        kvpairs.Script = args[0].substr(0, 100)
      } else if (lcCmd === 'info') {
        // the value is optional for the info command.
        if (args[0]) {
          kvpairs.KVKey = args[0]
        }
      } else if (lcCmd !== 'multi' && lcCmd !== 'exec') {
        kvpairs.KVKey = args[0]
      }

      let span
      return ao.instrument(
        () => {
          return {
            name: 'redis',
            kvpairs,
            finalize (createdSpan) {
              span = createdSpan
            }
          }
        },
        done => {
          cmdObj.callback = function (err, res) {
            if (span) {
              const {exit} = span.events
              if (err) {
                exit.error = err
              }
              if (addHit) {
                exit.kv.KVHit = !!res
              }
            }
            return done.apply(this, arguments)
          }
          fn.call(this, cmdObj)
        },
        conf,
        callback
      )
    })
  } else if (typeof client.send_command === 'function') {

    shimmer.wrap(client, 'send_command', fn => function (...args) {
      // send_command args
      const [cmd, values] = args
      const cb = lastFn(args)

      const lcCmd = cmd.toLowerCase()
      if (skip[lcCmd]) {
        return fn.call(this, cmd, values, ao.bind(cb))
      }

      // Flag this and future commands as multi
      if (lcCmd === 'multi') {
        isMulti = true
      }

      // Only include KVHit when not in multi
      const addHit = !isMulti

      // Exit multi-mode when exec is called, but after deciding addHit
      if (lcCmd === 'exec') {
        isMulti = false
      }

      const {address, host, port} = this
      const kvpairs = {
        Spec: 'cache',
        KVOp: lcCmd,
        RemoteHost: address || `${host}:${port}`
      }

      if (lcCmd === 'eval') {
        kvpairs.Script = values[0].substr(0, 100)
      } else if (lcCmd === 'info') {
        // the value is optional for the info command.
        if (values[0]) {
          kvpairs.KVKey = values[0]
        }
      } else if (lcCmd !== 'multi' && lcCmd !== 'exec') {
        kvpairs.KVKey = values[0]
      }

      let span
      return ao.instrument(
        () => {
          return {
            name: 'redis',
            kvpairs,
            finalize (createdSpan) {
              span = createdSpan
            }
          }
        },
        done => fn.call(this, cmd, values, function (err, res) {
          if (span) {
            const {exit} = span.events
            if (err) exit.error = err
            if (addHit) exit.kv.KVHit = !!res
          }
          return done.apply(this, arguments)
        }),
        conf,
        cb
      )
    })
  } else {
    logMissing('client.[internal_]send_command()')
    return
  }

}

function patchAddListener (client) {
  if (typeof client.on !== 'function') {
    logMissing('client.on()')
    return
  }
  shimmer.wrap(client, 'on', fn => function (event, cb) {
    if (event === 'subscribe' || event === 'message') {
      return fn.call(this, event, ao.lastEvent ? ao.bind(cb) : cb)
    }

    // if it's not subscribe or message then just call the function
    return fn.call(this, event, cb)
  })
}
