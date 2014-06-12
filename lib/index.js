var debug = require('debug')('node-oboe:__init')
var addon = module.exports = require('./addon')
// Enable later when I continue working on http probe
require('./require-patch')
var os = require('os')

// addon.Context.init()

addon.Context.setTracingMode(addon.TRACE_ALWAYS)
addon.Context.setDefaultSampleRate(addon.MAX_SAMPLE_RATE)

var reporter = new addon.UdpReporter('127.0.0.1')
addon.reporter = reporter

// TODO:
// - Handle nesting properly
// - Add info event method?
addon.trace = function (layer, handler) {
  var entry, exit;
  handler(function (data, edge) {
    if (entry) return
    data = data || {}

    data.Layer = layer
    data.Label = 'entry'

    if (edge) {
      entry = addon.Context.createEvent()
      console.log('attaching edge', edge.toString())
      entry.addEdge(edge)
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

    exit = addon.Context.createEvent()
    Object.keys(data).forEach(function (key) {
      exit.addInfo(key, data[key])
    })

    exit.addEdge(entry)

    debug(data.Layer + " " + data.Label + " sent: " + exit.toString())
    reporter.sendReport(exit)
  })
}

addon.trace('nodejs', function (entry, exit) {
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
