var debug = require('debug')('node-oboe:probes:http')
var extend = require('util')._extend
var shimmer = require('shimmer')
var Layer = require('../layer')
var addon = require('../addon')
var oboe = require('..')
var url = require('url')
var os = require('os')

module.exports = function (module) {
  patchServer(module)
  patchClient(module)

  return module
}

function patchClient (module) {
  shimmer.wrap(module, 'request', function (fn) {
    return function (options, callback) {
      // If we can't find a trace to continue, just run normally
      var last = Layer.last
      if ( ! oboe.tracing || ! last) {
        return fn(options, callback)
      }

      // Create the layer entity first
      var layer = last.descend('http-client')
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
      options.protocol = options.protocol || 'http:'

      // Support host or hostname + port
      if ( ! options.host && options.hostname) {
        options.host = options.hostname
        if (options.port) options.host += ':' + options.port
      }

      // Send entry event
      layer.enter({
        IsService: 'yes',
        RemoteURL: options.socketPath || (options.protocol + '//' + options.host + options.path),
        HTTPMethod: (options.method || 'GET').toUpperCase()
      })

      // Do request
      var ret = fn(options, callback)

      // Ensure the event list for the response event is an array
      if ( ! Array.isArray(ret._events.response)) {
        ret._events.response = [ret._events.response]
      }

      // Ensure our exit is pushed to the FRONT of the event list
      ret._events.response.unshift(function (res) {
        // Continue from X-Trace header, if present
        var xtrace = res.headers['x-trace']
        if (xtrace) {
          layer.events.exit.edges.push(xtrace)
        }

        // Send exit event with response status
        layer.exit({
          HTTPStatus: res.statusCode
        })
      })

      return ret
    }
  })
}

function patchServer (module) {
  var realEmit = module.Server.prototype.emit
  var realWrite = module.ServerResponse.prototype.write
  var realEnd = module.ServerResponse.prototype.end
  var realCreateServer = module.createServer

  var fowardedHeaders = [
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Port',
    'X-Forwarded-Proto'
  ]

  // Intercept 'request' event to trigger http entry
  module.Server.prototype.emit = function (type, req, res) {
    if (type !== 'request') {
      return realEmit.apply(this, arguments)
    }

    var xtrace = req.headers['x-trace']
    var meta = req.headers['x-tv-meta']

    if ( ! xtrace && ! oboe.sample('http', xtrace, meta)) {
      return realEmit.apply(this, arguments)
    }

    var args = arguments
    var self = this
    var ret

    // Bind streams to the request store
    oboe.requestStore.bindEmitter(req)
    oboe.requestStore.bindEmitter(res)

    oboe.requestStore.run(function () {
      var layer = res._http_layer = new Layer('http', xtrace, {
        'ClientIP': req.socket.remoteAddress,
        'HTTP-Host': os.hostname(),
        'Method': req.method,
        'URL': req.url,
        'Proto': 'http'
      })

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
      if (oboe.traceMode === oboe.addon.TRACE_ALWAYS) {
        if (meta) entry['X-TV-Meta'] = meta
        entry.SampleRate = oboe.sampleRate
        entry.SampleSource = oboe.sampleSource
      }

      var exitEvent = layer.events.exit.event
      res.setHeader('X-Trace', exitEvent.toString())

      layer.enter()
      ret = realEmit.apply(self, args)
    })

    return ret
  }

  // Intercept first write to trigger exit and set X-Trace header
  function sendExit (res) {
    // var layer = res._http_layer

    // Wrap the async entry/exit around the stream write start and end
    // layer.asyncEnter()

    // Restore original methods so this only gets called once
    // res.write = wrappedWrite
    res.write = realWrite
    res.end = wrappedEnd
  }

  // function wrappedWrite () {
  //   var self = this, args = arguments
  //   var layer = Layer.last.descend('http-response-write', {})
  //   return layer.run(function () {
  //     return realWrite.apply(self, args)
  //   })
  // }

  function wrappedEnd () {
    var layer = this._http_layer
    if ( ! layer) {
      return realEnd.apply(this, arguments)
    }

    // var args = arguments
    // var self = this
    // var ret
    //
    // Layer.last.descend('http-response-end', {}).run(function () {
    //   ret = realEnd.apply(self, args)
    // })


    // layer.asyncExit()
    layer.exit({
      Status: this.statusCode
    })

    var ret = realEnd.apply(this, arguments)

    return ret
  }

  module.ServerResponse.prototype.write = function () {
    sendExit(this)
    // return wrappedWrite.apply(this, arguments)
    return realWrite.apply(this, arguments)
  }
  module.ServerResponse.prototype.end = function () {
    sendExit(this)
    return wrappedEnd.apply(this, arguments)
  }

  return module
}
