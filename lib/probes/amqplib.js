'use strict'

const shimmer = require('shimmer')
const utility = require('../utility')
const URL = require('url')
const ao = require('..')
const conf = ao.probes.amqplib

module.exports = function (amqplib, options) {
  const callbacks = options.amqplib && options.amqplib.callbacks
  return patchConnection(amqplib, callbacks)
}

const patchedConnection = new WeakMap()
function patchConnection (v, callbacks) {
  if (!patchedConnection.get(v)) {
    patchedConnection.set(v, true)
    if (callbacks) {
      patchCallbackConnect(v)
    } else {
      patchPromiseConnect(v)
    }
  }

  return v
}

function patchCallbackConnect (proto) {
  if (typeof proto.connect !== 'function') return
  shimmer.wrap(proto, 'connect', fn => function connect (...args) {
    const cb = args.pop()
    const [path] = args
    const withUrl = addUrl(path)
    return fn.apply(this, args.concat(function (err, conn) {
      err ? cb(err) : cb(null, withUrl(patchCallbackModel(conn)))
    }))
  })
}

function patchPromiseConnect (proto) {
  if (typeof proto.connect !== 'function') return
  shimmer.wrap(proto, 'connect', fn => function connect (a, b) {
    return fn.call(this, a, b)
      .then(addUrl(a))
      .then(patchChannelModel)
  })
}

const connectionData = new WeakMap()
function addUrl (url) {
  url = typeof url === 'object' ? url : URL.parse(url)
  return (v) => {
    connectionData.set(v.connection, url)
    return v
  }
}

const patchedChannelModel = new WeakMap()
function patchChannelModel (v) {
  const proto = v.constructor.prototype
  if (proto && !patchedChannelModel.get(proto)) {
    patchedChannelModel.set(proto, true)
    patchChannelCreateChannel(proto)
  }

  return v
}

function patchChannelCreateChannel (proto) {
  if (typeof proto.createChannel !== 'function') return
  shimmer.wrap(proto, 'createChannel', fn => function createChannel () {
    return fn.call(this).then(patchChannel)
  })
}

const patchedCallbackModel = new WeakMap()
function patchCallbackModel (v) {
  const proto = v.constructor.prototype
  if (proto && !patchedCallbackModel.get(proto)) {
    patchedCallbackModel.set(proto, true)
    patchCallbackCreateChannel(proto)
  }

  return v
}

function patchCallbackCreateChannel (proto) {
  if (typeof proto.createChannel !== 'function') return
  shimmer.wrap(proto, 'createChannel', fn => function createChannel (cb) {
    return fn.call(this, function (err, ch) {
      err ? cb.call(this, err) : cb.call(this, null, patchChannel(ch))
    })
  })
}

const patchedChannel = new WeakMap()
function patchChannel (v) {
  const proto = v.constructor.prototype
  if (proto && !patchedChannel.get(proto)) {
    patchedChannel.set(proto, true)
    patchSendToQueue(proto)
    patchConsume(proto)
  }

  return v
}

function patchSendToQueue (proto) {
  if (typeof proto.sendToQueue !== 'function') return
  shimmer.wrap(proto, 'sendToQueue', fn => function (...args) {
    const [RoutingKey] = args

    const spanInfo = {
      name: 'amqplib',
      kvpairs: {
        Spec: 'pushq',
        Flavor: 'amqp',
        ExchangeAction: 'publish',
        RoutingKey
      },
      finalize (span) { // a function that is called after the span is created
        // Ensure there is an options object to add headers to
        const opts = args[3] || {}
        if (!~args.indexOf(opts)) {
          args.push(opts)
        }

        // Ensure headers contain SourceTrace
        opts.headers = opts.headers || {}
        opts.headers.SourceTrace = span.events.entry.toString()
      }
    }

    return ao.instrument(
      (last) => {
        const { hostname, port } = connectionData.get(this.connection)
        spanInfo.kvpairs.RemoteHost = `${hostname}:${port}`
        return spanInfo
      },
      () => fn.apply(this, args),
      conf
    )
  })
}

function patchConsume (proto) {
  if (typeof proto.consume !== 'function') return
  shimmer.wrap(proto, 'consume', fn => function (queue, cb, options) {
    const channel = this

    function consumePatched (msg) {
      const SourceTrace = msg.properties.headers.SourceTrace || ''

      const fnName = utility.fnName(cb)
      const spanInfo = {
        name: 'amqplib',
        kvpairs: {
          Spec: 'job',
          Flavor: 'amqp',
          JobName: fnName,
          Queue: queue,
          MsgID: msg.fields.consumerTag,
          RoutingKey: msg.fields.routingKey,
          URL: `/amqplib/${msg.fields.routingKey}`,
          Controller: 'amqplib',
          Action: fnName,
          SourceTrace: SourceTrace
        }
      }

      return ao.startOrContinueTrace(
        SourceTrace, // xtrace
        () => { // spanInfo make function
          const { hostname, port } = connectionData.get(channel.connection)
          spanInfo.kvpairs.RemoteHost = `${hostname}:${port}`
          return spanInfo
        },
        () => cb.call(this, msg), // run
        conf // opts
      )
    }
    const f = ao.lastEvent ? ao.bind(consumePatched) : consumePatched
    return fn.call(this, queue, f, options)
  })
}
