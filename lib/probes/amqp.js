'use strict'

const WeakMap = require('es6-weak-map')
const shimmer = require('ximmer')
const utility = require('../utility')
const ao = require('..')
const conf = ao.probes.amqp

function patchConnect (proto) {
  if (typeof proto.connect !== 'function') return
  shimmer.wrap(proto, 'connect', connect => function () {
    this._readyCallback = ao.bind(this._readyCallback)
    return connect.call(this)
  })
}

function patchExchange (proto) {
  if (typeof proto.exchange !== 'function') return
  shimmer.wrap(proto, 'exchange', exchange => function (name, options, cb) {
    const res = exchange.call(this, name, options, ao.bind(cb))
    const proto = res && res.constructor && res.constructor.prototype
    if (proto) {
      patchExchangePublish(proto)
      patchEmitterOnUse(proto)
    }
    ao.bindEmitter(res)
    return res
  })
}

function patchQueue (proto) {
  if (typeof proto.queue !== 'function') return
  shimmer.wrap(proto, 'queue', queue => function (...args) {
    if (args.length) args.push(ao.bind(args.pop()))
    const res = queue.apply(this, args)
    const proto = res && res.constructor && res.constructor.prototype
    if (proto) {
      patchQueueSubscribe(proto)
      patchEmitterOnUse(proto)
    }
    ao.bindEmitter(res)
    return res
  })
}

const patchedQueue = new WeakMap()
function patchQueueSubscribe (proto) {
  if (patchedQueue.get(proto)) return
  patchedQueue.set(proto, true)

  // This is used to propagate the callback name forward
  // from the subscribe patch into the subscribeRaw patch.
  let trueCb
  if (typeof proto.subscribe === 'function') {
    shimmer.wrap(proto, 'subscribe', fn => function (options, cb) {
      if (typeof options === 'function') {
        cb = options
        options = {}
      }
      trueCb = cb
      const ret = fn.call(this, options, cb)
      trueCb = null
      return ret
    })
  }

  if (typeof proto.subscribeRaw === 'function') {
    shimmer.wrap(proto, 'subscribeRaw', fn => function (options, cb) {
      const queue = this

      if (typeof options === 'function') {
        cb = options
        options = {}
      }

      // Store a reference to the possible true callback,
      // as it is about to get nulled in queue.subscribe().
      let refCb = trueCb

      return fn.call(queue, options, function (msg) {
        const SourceTrace = msg && msg.headers && msg.headers.SourceTrace

        if (!refCb) {
          refCb = queue.consumerTagListeners[msg.consumerTag]
        }

        return ao.startOrContinueTrace(
          SourceTrace,    // was {meta: SourceTrace}
          last => {
            const {host, port} = queue.connection.options
            const fnName = utility.fnName(refCb)
            return last.descend('amqp', {
              Spec: 'job',
              Flavor: 'amqp',
              JobName: fnName,
              Queue: queue.name,
              MsgID: msg.consumerTag,
              RoutingKey: msg.routingKey,
              RemoteHost: `${host}:${port}`,
              URL: `/amqp/${queue.name}`,
              Controller: 'amqp',
              Action: fnName,
              SourceTrace
            })
          },
          (done, span) => {
            const ret = cb.call(this, msg)
            if (!options.noAck && span) {
              patchMessage(msg, done, span)
            } else {
              done()
            }
            return ret
          },
          conf,
          noop
        )
      })
    })
  }
}

function patchMessage (msg, done, span) {
  const {exit} = span.events

  if (typeof msg.acknowledge === 'function') {
    shimmer.wrap(msg, 'acknowledge', ack => function () {
      done()
      exit.Status = 'Acknowledged'
      return ack.apply(this, arguments)
    })
  }

  if (typeof msg.reject === 'function') {
    shimmer.wrap(msg, 'reject', rej => function () {
      done()
      exit.Status = 'Rejected'
      return rej.apply(this, arguments)
    })
  }
}

const patchedPublish = new WeakMap()
function patchExchangePublish (exchange) {
  if (typeof exchange.publish !== 'function') return
  if (patchedPublish.get(exchange)) return
  patchedPublish.set(exchange, true)

  shimmer.wrap(exchange, 'publish', publish => function (key, msg, opts, cb) {
    opts = opts || {}
    const {confirm} = this.options
    const runner = confirm
      ? cb => publish.call(this, key, msg, opts, cb)
      : () => publish.call(this, key, msg, opts)

    return ao.instrument(last => {
      const {host, port} = this.connection.options
      const span = last.descend('amqp', {
        Spec: 'pushq',
        Flavor: 'amqp',
        RemoteHost: `${host}:${port}`,
        ExchangeName: this.name,
        ExchangeAction: 'publish',
        RoutingKey: key,
        ExchangeType: this.options.type
      })
      // Add SourceTrace ID to headers
      opts.headers = opts.headers || {}
      opts.headers.SourceTrace = span.events.entry.toString()
      return span
    }, runner, conf, cb)
  })
}

const patchedEmitter = new WeakMap()
function patchEmitterOnUse (emitter) {
  if (patchedEmitter.get(emitter)) return
  patchedEmitter.set(emitter, true)

  const attachers = ['on', 'addListener']
  attachers.forEach(method => {
    if (typeof emitter[method] !== 'function') return
    shimmer.wrap(emitter, method, fn => function (name, handler) {
      return fn.call(this, name, ao.bind(handler))
    })
  })
}

module.exports = function (amqp) {
  const proto = amqp.Connection && amqp.Connection.prototype
  if (proto) {
    patchConnect(proto)
    patchExchange(proto)
    patchQueue(proto)
  }

  return amqp
}

function noop () {}
