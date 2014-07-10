var debug = require('debug')('node-oboe:probes:http')
var Layer = require('../layer')
var addon = require('../addon')
var oboe = require('..')
var os = require('os')

module.exports = function (module) {
  var realEmit = module.Server.prototype.emit
  var realWrite = module.ServerResponse.prototype.write
  var realEnd = module.ServerResponse.prototype.end
  var realCreateServer = module.createServer

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

    oboe.requestStore.run(function () {
      var layer = res._http_layer = new Layer('http', xtrace, {
        'HTTP-Host': os.hostname(),
        'Method': req.method,
        'URL': req.url,
        'Proto': 'http'
      })

      // layer.async = true

      // Add some extra stuff to the entry event of the layer
      var entry = layer.events.entry
      if (oboe.traceMode !== 'always') {
        if (meta) entry['X-TV-Meta'] = meta
      } else {
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
