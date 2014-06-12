var debug = require('debug')('node-oboe:__init')
var addon = require('./addon')
require('./require-patch')
var os = require('os')

// Abstract settings with setters and getters
var mode, sampleRate
var modeMap = {
  through: addon.TRACE_THROUGH,
  always: addon.TRACE_ALWAYS,
  never: addon.TRACE_NEVER
}

Object.defineProperty(exports, 'tracing', {
  get: function () { return mode },
  set: function (value) {
    addon.Context.setTracingMode(modeMap[value])
    mode = value
  }
})

Object.defineProperty(exports, 'sampleRate', {
  get: function () { return mode },
  set: function (value) {
    addon.Context.setDefaultSampleRate(value)
    sampleRate = value
  }
})

// Set basic settings
exports.tracing = 'always'
exports.sampleRate = addon.MAX_SAMPLE_RATE

// Create reporter instance
var reporter = new addon.UdpReporter('127.0.0.1')

// TODO:
// - Handle nesting properly
// - Add info event method?
var trace = exports.trace = function (layer, handler) {
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
    return entry
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
    return exit
  })
}

// Async traces are made from a double trace.
// One represents the call time and another represents the callback time.
exports.asyncTrace = function (type, handler) {
  trace(type, function (entry, exit) {
    trace(type + ' (callback)', function (asyncEntry, asyncExit) {
      handler(entry, asyncEntry, function (data) {
        exit(data)
        asyncExit()
      })
    })
  })
}

// Send __Init event
trace('nodejs', function (entry, exit) {
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
