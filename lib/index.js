var debug = require('debug')('node-oboe:__init')
var addon = require('./addon')
require('./require-patch')
var os = require('os')

// Set basic settings
addon.Context.setTracingMode(addon.TRACE_ALWAYS)
addon.Context.setDefaultSampleRate(addon.MAX_SAMPLE_RATE)

// Create reporter instance
var reporter = new addon.UdpReporter('127.0.0.1')

// TODO:
// - Handle nesting properly
// - Add info event method?
exports.trace = function (layer, handler) {
  var entry, exit;
  handler(function (data, edge) {
    if (entry) return
    data = data || {}

    data.Layer = layer
    data.Label = 'entry'

    if (edge) {
      addon.Context.set(edge)
      entry = addon.Context.createEvent()
      debug('adding edge of ' + edge.toString() + ' to ' + entry.toString())
    } else {
      entry = addon.Context.startTrace()
    }

    Object.keys(data).forEach(function (key) {
      entry.addInfo(key, data[key])
    })

    debug(data.Layer + " " + data.Label + " sent: " + entry.toString())
    reporter.sendReport(entry)
  }, function (data) {
    if (exit) return
    data = data || {}

    data.Layer = layer
    data.Label = 'exit'

    // Make sure we switch back to the right context.
    // This is important because, with asynchrony,
    // other requests may have rewritten the context.
    addon.Context.set(entry.toString())

    exit = addon.Context.createEvent()
    Object.keys(data).forEach(function (key) {
      exit.addInfo(key, data[key])
    })

    debug('adding edge of ' + entry.toString() + ' to ' + exit.toString())
    // exit.addEdge(entry)

    debug(data.Layer + " " + data.Label + " sent: " + exit.toString())
    reporter.sendReport(exit)
  })
}

// Send __Init event
exports.trace('nodejs', function (entry, exit) {
  entry({
    __Init: 1,
    'Layer': 'nodejs',
    'Label': 'entry',
    'Node.Version': process.versions.node,
    'Node.V8.Version': process.versions.v8,
    'Node.LibUV.Version': process.versions.uv,
    'Node.OpenSSL.Version': process.versions.openssl,
    'Node.Ares.Version': process.versions.ares,
    'Node.ZLib.Version': process.versions.zlib,
    'Node.HTTPParser.Version': process.versions.http_parser,
    'Node.Oboe.Version': require('../package.json').version,
  })
  exit()
})
