var requirePatch = require('../require-patch')
var shimmer = require('shimmer')
var slice = require('sliced')
var tv = require('..')
var Layer = tv.Layer
var conf = tv.amqp

module.exports = function (amqp) {
  shimmer.wrap(amqp.Connection.prototype, 'connect', function (connect) {
    return function () {
      var last = Layer.last
      if (last) {
        this._readyCallback = tv.requestStore.bind(this._readyCallback)
      }
      return connect.call(this)
    }
  })

  shimmer.wrap(amqp.Connection.prototype, 'exchange', function (exchange) {
    return function (name, options, openCallback) {
      var last = Layer.last
      if (last) {
        openCallback = tv.requestStore.bind(openCallback)
      }
      var res = exchange.call(this, name, options, openCallback)
      patchExchange(res && res.constructor && res.constructor.prototype)
      patchEmitterOnUse(res && res.constructor && res.constructor.prototype)
      if (last) {
        tv.requestStore.bindEmitter(res)
      }
      return res
    }
  })

  shimmer.wrap(amqp.Connection.prototype, 'queue', function (queue) {
    return function (name, options, openCallback) {
      var args = slice(arguments)
      var last = Layer.last
      if (last) {
        var lastArg = args.pop()
        if (typeof lastArg === 'function') {
          lastArg = tv.requestStore.bind(lastArg)
        }
        args.push(lastArg)
      }
      var res = queue.apply(this, args)
      patchEmitterOnUse(res && res.constructor && res.constructor.prototype)
      if (last) {
        tv.requestStore.bindEmitter(res)
      }
      return res
    }
  })

  return amqp
}

function patchExchange (exchange) {
  if (exchange._tv_patched) return
  exchange._tv_patched = true

  shimmer.wrap(exchange, 'publish', function (publish) {
    return function (routingKey, message, options, callback) {
      var connOptions = this.connection.options
      var confirm = this.options.confirm
      var exchange = this
      var res

      var runner = confirm
        ? function (callback) {
          res = publish.call(exchange, routingKey, message, options, callback)
        }
        : function () {
          res = publish.call(exchange, routingKey, message, options)
        }

      var cb =  confirm && (callback || function () {})

      tv.instrument(function (last) {
        return last.descend('amqp', {
          RemoteHost: connOptions.host + ':' + connOptions.port,
          ExchangeName: exchange.name,
          ExchangeAction: 'publish',
          RoutingKey: routingKey
        })
      }, runner, conf, cb)

      return res
    }
  })
}

function patchEmitterOnUse (emitter) {
  if (emitter._tv_emitter_patched) return
  emitter._tv_emitter_patched = true

  var attachers = ['on', 'addListener']
  attachers.forEach(function (method) {
    shimmer.wrap(emitter, method, function (fn) {
      return function (name, handler) {
        var last = Layer.last
        if (last) {
          handler = tv.requestStore.bind(handler)
        }

        return fn.call(this, name, handler)
      }
    })
  })
}
