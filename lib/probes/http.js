var patchEmitter = require('event-unshift')
var extend = require('util')._extend
var shimmer = require('shimmer')
var url = require('url')
var os = require('os')

var Layer = require('../layer')
var Event = require('../event')
var tv = require('..')

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
      if ( ! last) {
        return fn(options, callback)
      }

      // If disabled or a call from https.request, just bind
      if ( ! conf.enabled || (proto === 'http' && options._defaultAgent)) {
        return fn(options, callback ? tv.requestStore.bind(callback) : undefined)
      }

      // Create the layer entity first
      var layer = last.descend(name)
      layer.events.entry.Async = true

      // Parse options object
      if (typeof options === 'string') {
        options = url.parse(options)
      }
      var parsed = extend({}, options)

      // Add X-Trace header to trace hops
      options.headers = options.headers || {}
      options.headers['X-Trace'] = layer.events.entry.toString()

      // Set default protocol
      parsed.protocol = parsed.protocol || proto + ':'

      // Fix wrong options structure for formatting url
      var i = parsed.path.indexOf('?')
      parsed.pathname = parsed.path.slice(0, i)
      parsed.search = parsed.path.slice(i)

      // Remove query properties when filtering
      if ( ! conf.includeRemoteUrlParams) {
        delete parsed.search
        delete parsed.query
      }

      // Send entry event
      var data = {
        Spec: 'rsc',
        IsService: 'yes',
        RemoteURL: url.format(parsed),
        HTTPMethod: (options.method || 'GET').toUpperCase()
      }

      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace()
      }

      var ret
      tv.requestStore.run(function () {
        layer.enter(data)

        // Do request
        ret = fn(options, callback)

        // Patch emitter
        patchEmitter(ret)

        // Report socket errors
        ret.unshift('error', function (error) {
          layer.info({ error: error })
        })

        // Ensure our exit is pushed to the FRONT of the event list
        ret.unshift('response', function (res) {
          // Continue from X-Trace header, if present
          var xtrace = res.headers['x-trace']
          if (xtrace) {
            layer.events.exit.edges.push(xtrace)
          }

          // Patch emitter
          patchEmitter(res)

          // Report socket errors
          res.unshift('error', function (error) {
            last.info({ error: error })
          })

          // Send exit event with response status
          layer.exit({
            HTTPStatus: res.statusCode
          })
        })
      })

      return ret
    }
  })
}

function patchServer (module, proto) {
  var conf = tv[proto]

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
      var shouldSample = xtrace || tv.always

      if ( ! (shouldSample && tv.sample('nodejs', xtrace, meta))) {
        return realEmit.apply(this, arguments)
      }

      // Patch request and response emitters to support unshifting
      patchEmitter(req)
      patchEmitter(res)

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
        var port = Number(parts.shift() || defaultPort[proto])

        var path = req.url
        if ( ! conf.includeRemoteUrlParams) {
          path = path.replace(/\?.*/, '')
        }

        var layer = res._http_layer = new Layer('nodejs', xtrace, {
          'Spec': 'ws',
          'ClientIP': req.socket.remoteAddress,
          'HTTP-Host': host,
          'Port': port,
          'Method': req.method,
          'URL': path,
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

        // Report socket errors
        req.unshift('error', reportError)
        res.unshift('error', reportError)
        function reportError (error) {
          layer.info({ error: error })
        }

        layer.enter()
        ret = realEmit.apply(self, args)
      })

      return ret
    }
  })

  // Patch ServerResponse to send the exit event when the
  // response is completed or the connection is terminated
  if (proto == 'http' && ! module.ServerResponse.prototype._sendXTraceExit) {
    module.ServerResponse.prototype._sendXTraceExit = function () {
      var layer = this._http_layer
      if ( ! layer) return

      if (Event.last && Event.last !== layer.events.entry && ! Event.last.Async) {
        layer.events.exit.edges.push(Event.last)
      }

      layer.exit({
        Status: this.statusCode
      })
    }

    shimmer.wrap(module.ServerResponse.prototype, 'detachSocket', function (fn) {
      return function (socket) {
        this._sendXTraceExit()
        return fn.call(this, socket)
      }
    })
  }

  return module
}
