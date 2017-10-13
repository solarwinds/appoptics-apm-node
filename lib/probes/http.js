'use strict'

const patchEmitter = require('event-unshift')
const extend = require('util')._extend
const shimmer = require('shimmer')
const url = require('url')
const os = require('os')
const ao = require('..')
const Layer = ao.Layer
const Event = ao.Event

const defaultPort = {
  https: 443,
  http: 80
}

module.exports = function (module, protocol) {
  protocol = protocol || 'http'
  patchServer(module, protocol)
  patchClient(module, protocol)
  return module
}

function patchClient (module, protocol) {
  const name = protocol + '-client'
  const conf = ao[name]

  function isHttpsFromHttp (options) {
    return protocol === 'http' && options._defaultAgent
  }

  shimmer.wrap(module, 'request', fn => function (options, callback) {
    // If not tracing, disabled or a call from https.request, just bind
    const last = Layer.last
    if (!last || !conf.enabled || isHttpsFromHttp(options)) {
      return fn(options, ao.bind(callback))
    }

    let layer
    let data
    try {
      // Create the layer entity first
      layer = last.descend(name)
      layer.async = true

      // Parse options object
      if (typeof options === 'string') {
        options = url.parse(options)
      }
      const parsed = extend({}, options)

      // Add X-Trace header to trace hops
      options.headers = options.headers || {}
      options.headers['X-Trace'] = layer.events.entry.toString()

      // Set default protocol
      parsed.protocol = parsed.protocol || protocol + ':'

      // Fix wrong options structure for formatting url
      const i = parsed.path.indexOf('?')
      parsed.pathname = parsed.path.slice(0, i)
      parsed.search = parsed.path.slice(i)

      // Remove query properties when filtering
      if (!conf.includeRemoteUrlParams) {
        delete parsed.search
        delete parsed.query
      }

      // Send entry event
      data = {
        Spec: 'rsc',
        IsService: 'yes',
        RemoteURL: url.format(parsed),
        HTTPMethod: (options.method || 'GET').toUpperCase()
      }

      if (conf.collectBacktraces) {
        data.Backtrace = ao.backtrace()
      }
    } catch (e) {}

    let ret
    ao.requestStore.run(() => {
      layer.enter(data)

      // Do request
      ret = fn(options, callback)

      try {
        // Patch emitter
        patchEmitter(ret)

        // Report socket errors
        ret.unshift('error', error => layer.error(error))

        // Ensure our exit is pushed to the FRONT of the event list
        ret.unshift('response', res => {
          // Continue from X-Trace header, if present
          const xtrace = res.headers['x-trace']
          if (xtrace) {
            layer.events.exit.edges.push(xtrace)
          }

          // Patch emitter
          patchEmitter(res)

          // Report socket errors
          res.unshift('error', error => last.error(error))

          // Send exit event with response status
          layer.exit({
            HTTPStatus: res.statusCode
          })
        })
      } catch (e) {}
    })

    return ret
  })
}

function patchServer (module, protocol) {
  const conf = ao[protocol]

  const fowardedHeaders = [
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Port',
    'X-Forwarded-Proto'
  ]

  const proto = module.Server && module.Server.prototype

  // Intercept 'request' event to trigger http entry
  shimmer.wrap(proto, 'emit', realEmit => function (type, req, res) {
    if (type !== 'request' || ao.never) {
      return realEmit.apply(this, arguments)
    }

    const xtrace = req.headers['x-trace']
    const meta = req.headers['x-tv-meta']
    const shouldSample = xtrace || ao.always

    if (!(shouldSample && ao.sample('nodejs', xtrace, meta))) {
      return realEmit.apply(this, arguments)
    }

    const args = arguments

    try {
      // Patch request and response emitters to support unshifting
      patchEmitter(req)
      patchEmitter(res)
      patchEmitter(res.socket)

      // Bind streams to the request store
      ao.bindEmitter(req)
      ao.bindEmitter(res)
    } catch (e) {}

    let ret
    ao.requestStore.run(() => {
      try {
        const layer = res._http_layer = makeLayer(req)

        // Keep upper-most layer for later
        ao.requestStore.set('topLayer', layer)

        getRequestHeaders(layer, req)
        setResponseHeaders(layer, res)
        wrapRequestResponse(layer, req, res)
      } catch (e) {}

      ret = realEmit.apply(this, args)
    })

    return ret
  })

  function getHost (req) {
    return (req.headers.host || os.hostname()).split(':')[0]
  }

  function getPort (req) {
    const {host} = req.headers
    return Number(host ? host.split(':')[1] : defaultPort[protocol])
  }

  function getPath ({ url }) {
    return conf.includeRemoteUrlParams ? url : url.replace(/\?.*/, '')
  }

  function makeLayer (req) {
    return new Layer('nodejs', req.headers['x-trace'], {
      'Spec': 'ws',
      'ClientIP': req.socket.remoteAddress,
      'HTTP-Host': getHost(req),
      'Port': getPort(req),
      'Method': req.method,
      'URL': getPath(req),
      'Proto': protocol
    })
  }

  function getRequestHeaders (layer, req) {
    // Get entry event
    const {entry} = layer.events
    const {headers} = req

    // Add forwarded headers
    fowardedHeaders.forEach(name => {
      const toForward = headers[name.toLowerCase()]
      if (toForward) entry[name.replace(/^X-/, '')] = toForward
    })

    // Upstream latency
    const requestStart = headers['x-request-start'] || headers['x-queue-start']
    if (requestStart) entry['Request-Start'] = requestStart

    const queueTime = headers['x-queue-time']
    if (queueTime) entry['Queue-Time'] = queueTime

    // Add some extra stuff to the entry event of the layer
    if (ao.always) {
      const meta = headers['x-tv-meta']
      if (meta) entry['X-TV-Meta'] = meta
      entry.SampleRate = ao.sampleRate
      entry.SampleSource = ao.sampleSource
    }
  }

  function setResponseHeaders (layer, res) {
    const {exit} = layer.events
    Object.defineProperty(exit, 'ignore', { value: true })
    res.setHeader('X-Trace', exit.toString())
  }

  function wrapRequestResponse (layer, req, res) {
    // Report socket errors
    req.unshift('error', error => layer.error(error))
    res.unshift('error', error => layer.error(error))

    // Ensure response is patched and add exit finalizer
    ao.patchResponse(res)
    ao.addResponseFinalizer(res, () => {
      const {last} = Event
      if (last && last !== layer.events.entry && !last.Async) {
        layer.events.exit.edges.push(last)
      }

      layer.exit({
        Status: res.statusCode
      })
    })

    layer.enter()
  }

  return module
}
