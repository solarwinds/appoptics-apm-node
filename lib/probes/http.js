var extend = require('util')._extend
var shimmer = require('shimmer')
var Layer = require('../layer')
var Event = require('../event')
var tv = require('..')
var url = require('url')
var os = require('os')

var http = require('http')

module.exports = function (module, proto) {
  proto = proto || 'http'
  patchServer(module, proto)
  patchClient(module, proto)

  return module
}

function patchClient (module, proto) {
  var name = proto + '-client'
  var conf = tv[name]

  shimmer.wrap(module, 'request', function (fn) {
    return function (options, callback) {
      // If we can't find a trace to continue, just run normally
      var last = Layer.last
      if ( ! tv.tracing || ! last) {
        return fn(options, callback)
      }

      // If disabled or a call from https.request, just bind
      if ( ! conf.enabled || (proto == 'http' && options._defaultAgent)) {
        return fn(options, tv.requestStore.bind(callback))
      }

      // Create the layer entity first
      var layer = last.descend(name)
      layer.events.entry.Async = true

      // Parse options object
      if (typeof options === 'string') {
        options = url.parse(options)
      } else {
        options = extend({}, options)
      }

      // Add X-Trace header to trace hops
      options.headers = options.headers || {}
      options.headers['X-Trace'] = layer.events.entry.toString()

      // Set default protocol
      options.protocol = options.protocol || proto + ':'

      // Support host or hostname + port
      if ( ! options.host && options.hostname) {
        options.host = options.hostname
        if (options.port) options.host += ':' + options.port
      }

      // Send entry event
      var data = {
        IsService: 'yes',
        RemoteURL: options.socketPath || (options.protocol + '//' + options.host + options.path),
        HTTPMethod: (options.method || 'GET').toUpperCase()
      }

      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace(4)
      }

      layer.enter(data)

      // Do request
      var ret = fn(options, callback)

      // Ensure the event list for the response event is an array
      if ( ! Array.isArray(ret._events.response)) {
        ret._events.response = [ret._events.response]
      }

      // Ensure our exit is pushed to the FRONT of the event list
      ret._events.response.unshift(tv.requestStore.bind(function (res) {
        // Continue from X-Trace header, if present
        var xtrace = res.headers['x-trace']
        if (xtrace) {
          layer.events.exit.edges.push(xtrace)
        }

        // Send exit event with response status
        layer.exit({
          HTTPStatus: res.statusCode
        })
      }))

      return ret
    }
  })
}

function patchServer (module, proto) {
  var fowardedHeaders = [
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Port',
    'X-Forwarded-Proto'
  ]

  var defaultPort = {
    https: 443,
    http: 80
  }

  // Intercept 'request' event to trigger http entry
  shimmer.wrap(module.Server.prototype, 'emit', function (realEmit) {
    return function (type, req, res) {
      if (type !== 'request' || tv.never) {
        return realEmit.apply(this, arguments)
      }

      var xtrace = req.headers['x-trace']
      var meta = req.headers['x-tv-meta']

      if ( ! xtrace && ! tv.sample('nodejs', xtrace, meta)) {
        return realEmit.apply(this, arguments)
      }

      var args = arguments
      var self = this
      var ret

      // Bind streams to the request store
      tv.requestStore.bindEmitter(req)
      tv.requestStore.bindEmitter(res)

      tv.requestStore.run(function () {
        var fullHost = req.headers.host || os.hostname()
        var parts = fullHost.split(':')
        var host = parts.shift()
        var port = parts.shift() || defaultPort[proto]

        var layer = res._http_layer = new Layer('nodejs', xtrace, {
          'ClientIP': req.socket.remoteAddress,
          'HTTP-Host': host,
          'Port': port,
          'Method': req.method,
          'URL': req.url,
          'Proto': proto
        })

        // Keep upper-most layer for later
        tv.requestStore.set('topLayer', layer)

        // Get entry event
        var entry = layer.events.entry

        // Add forwarded headers
        fowardedHeaders.forEach(function (name) {
          var header = req.headers[name.toLowerCase()]
          if (header) entry[name.replace(/^X-/, '')] = header
        })

        // Upstream latency
        var requestStart = req.headers['x-request-start'] || req.headers['x-queue-start']
        if (requestStart) {
          entry['Request-Start'] = requestStart
        }
        var queueTime = req.headers['x-queue-time']
        if (queueTime) {
          entry['Queue-Time'] = queueTime
        }

        // layer.async = true

        // Add some extra stuff to the entry event of the layer
        if (tv.traceMode === tv.addon.TRACE_ALWAYS) {
          if (meta) entry['X-TV-Meta'] = meta
          entry.SampleRate = tv.sampleRate
          entry.SampleSource = tv.sampleSource
        }

        var exitEvent = layer.events.exit.event
        Object.defineProperty(layer.events.exit, 'ignore', {
          value: true
        })
        res.setHeader('X-Trace', exitEvent.toString())

        layer.enter()
        ret = realEmit.apply(self, args)
      })

      return ret
    }
  })

  if ( ! http.ServerResponse.prototype._sendXTraceExit) {
    http.ServerResponse.prototype._sendXTraceExit = function () {
      var layer = this._http_layer
      if ( ! layer) return

      if (Event.last && Event.last !== layer.events.entry && ! Event.last.Async) {
        layer.events.exit.edges.push(Event.last)
      }

      layer.exit({
        Status: this.statusCode
      })
    }

    shimmer.wrap(http.ServerResponse.prototype, 'assignSocket', function (fn) {
      return function (socket) {
        socket.on('close', this._sendXTraceExit.bind(this))
        this.on('finish', this._sendXTraceExit.bind(this))
        return fn.call(this, socket)
      }
    })
  }

  return module
}
