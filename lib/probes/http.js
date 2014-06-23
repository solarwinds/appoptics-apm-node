var debug = require('debug')('node-oboe:probes:http')
var Layer = require('../layer')
var oboe = require('..')
var os = require('os')

module.exports = function (module) {
  var realEmit = module.Server.prototype.emit
  var realWrite = module.ServerResponse.prototype.write
  var realEnd = module.ServerResponse.prototype.end

  // Intercept 'request' event to trigger http entry
  module.Server.prototype.emit = function (type, req, res) {
    if (type !== 'request') {
      return realEmit.apply(this, arguments)
    }

    var layer = res.layer = new Layer('http', req.headers['x-trace'], {
      'Layer': 'http',
      'Label': 'entry',
      'HTTP-Host': os.hostname(),
      'Method': req.method,
      'URL': req.url,
      'Proto': 'http'
    })

    // Switch layer into async mode manually
    layer.async = true

    // Add some extra stuff to the entry event of the layer
    var entry = layer.events.entry
    if (oboe.traceMode !== 'always') {
      var meta = req.headers['x-tv-meta']
      if (meta) entry['X-TV-Meta'] = meta
    } else {
      entry.SampleRate = oboe.sampleRate
    }

    // Enter the layer
    layer.enter()

    return realEmit.apply(this, arguments)
  }

  // Intercept first write to trigger exit and set X-Trace header
  function sendExit (res) {
    var layer = res.layer
    var exitEvent = layer.events.exit.event

    // Wrap the async entry/exit around the stream write start and end
    layer.asyncEnter()
    res.on('finish', function () {
      layer.asyncExit()
      layer.exit()
    })

    // Write exit header
    res.setHeader('X-Trace', exitEvent.toString())

    // Restore original methods so this only gets called once
    res.write = realWrite
    res.end = realEnd
  }

  module.ServerResponse.prototype.write = function () {
    sendExit(this)
    return realWrite.apply(this, arguments)
  }
  module.ServerResponse.prototype.end = function () {
    sendExit(this)
    return realEnd.apply(this, arguments)
  }

  return module
}
