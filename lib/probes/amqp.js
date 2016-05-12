'use strict'

const WeakMap = require('es6-weak-map')
const shimmer = require('shimmer')
const tv = require('..')
const conf = tv.amqp

function patchConnect (proto) {
  if (typeof proto.connect !== 'function') return
  shimmer.wrap(proto, 'connect', connect => function () {
    this._readyCallback = tv.bind(this._readyCallback)
    return connect.call(this)
  })
}

function patchExchange (proto) {
  if (typeof proto.exchange !== 'function') return
  shimmer.wrap(proto, 'exchange', exchange => function (name, options, cb) {
    const res = exchange.call(this, name, options, tv.bind(cb))
    const proto = res && res.constructor && res.constructor.prototype
    if (proto) {
      patchExchangePublish(proto)
      patchEmitterOnUse(proto)
    }
    tv.bindEmitter(res)
    return res
  })
}

function patchQueue (proto) {
  if (typeof proto.queue !== 'function') return
  shimmer.wrap(proto, 'queue', queue => function (...args) {
    if (args.length) args.push(tv.bind(args.pop()))
    const res = queue.apply(this, args)
    const proto = res && res.constructor && res.constructor.prototype
    if (proto) patchEmitterOnUse(proto)
    tv.bindEmitter(res)
    return res
  })
}

const patchedPublish = new WeakMap()
function patchExchangePublish (exchange) {
  if (typeof exchange.publish !== 'function') return
  if (patchedPublish.get(exchange)) return
  patchedPublish.set(exchange, true)

  shimmer.wrap(exchange, 'publish', publish => function (key, msg, opts, cb) {
    const {confirm} = this.options
    const runner = confirm
      ? cb => publish.call(this, key, msg, opts, cb)
      : () => publish.call(this, key, msg, opts)

    return tv.instrument(last => {
      const { host, port } = this.connection.options
      return last.descend('amqp', {
        RemoteHost: `${host}:${port}`,
        ExchangeName: this.name,
        ExchangeAction: 'publish',
        RoutingKey: key
      })
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
      return fn.call(this, name, tv.bind(handler))
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
