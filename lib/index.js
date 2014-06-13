var debug = require('debug')('node-oboe:__init')
var oboe = require('./addon')
require('./require-patch')
var os = require('os')

// Abstract settings with setters and getters
var traceMode, sampleRate
var modeMap = {
  through: oboe.TRACE_THROUGH,
  always: oboe.TRACE_ALWAYS,
  never: oboe.TRACE_NEVER
}

var mapper = function (v) { return modeMap[v] }
var modes = Object.keys(modeMap).map(mapper).sort()
var minMode = modes.shift()
var maxMode = modes.pop()

Object.defineProperty(exports, 'traceMode', {
  get: function () { return traceMode },
  set: function (value) {
    if (typeof value !== 'number') {
      value = modeMap[value]
    }
    oboe.Context.setTracingMode(value)
    traceMode = value
  }
})

Object.defineProperty(exports, 'sampleRate', {
  get: function () { return sampleRate },
  set: function (value) {
    oboe.Context.setDefaultSampleRate(value)
    sampleRate = value
  }
})

// Set default settings
exports.traceMode = 'through'
exports.sampleRate = oboe.MAX_SAMPLE_RATE

// Create reporter instance
var reporter = new oboe.UdpReporter('127.0.0.1')

function addInfo (event, data) {
  Object.keys(data).forEach(function (key) {
    event.addInfo(key, data[key])
  })
}

// TODO:
// - Handle nesting properly
// - Add info event method?
exports.trace = trace
function trace (layer, handler) {
  var entry, exit

  handler(function (data, edge) {
    if (entry) return
    data = data || {}
    data.Layer = layer
    data.Label = 'entry'

    var valid = oboe.Context.isValid()
    if (edge) {
      oboe.Context.set(edge)
    }

    // Use the edge value to determine if we should start or continue a trace
    if (edge || ! valid) {
      entry = oboe.Context.createEvent()
      // debug('adding edge of ' + edge.toString() + ' to ' + entry.toString())
    } else {
      entry = oboe.Context.startTrace()
    }

    // Add KV data to the event
    addInfo(entry, data)

    // Debug logging
    debug(data.Layer + " " + data.Label + " sent: " + entry.toString())

    // Delay reporting to allow further modification
    setImmediate(function () {
      reporter.sendReport(entry)
    })

    return entry
  }, function (data, edge) {
    if (exit) return
    data = data || {}
    data.Layer = layer
    data.Label = 'exit'

    // Make sure we switch back to the right context.
    // This is important because, with asynchrony,
    // other requests may have rewritten the context.
    oboe.Context.set((edge || entry).toString())

    // Create exit event linked to the entry event
    // TODO: This needs to change to add edge for nested exits
    exit = oboe.Context.createEvent()

    // Add KV data to the event
    addInfo(exit, data)

    // Debug logging
    debug('adding edge of ' + entry.toString() + ' to ' + exit.toString())
    debug(data.Layer + " " + data.Label + " sent: " + exit.toString())

    // Delay reporting to allow further modification
    setImmediate(function () {
      reporter.sendReport(exit)
    })

    return exit
  })
}

// Async traces are made from a double trace.
// One represents the call time and another represents the callback time.
exports.asyncTrace = function (type, handler) {
  trace(type, function (entry, exit) {
    trace(type + ' (callback)', function (asyncEntry, asyncExit) {
      handler(entry, asyncEntry, function (data) {
        var exitEvent = exit(data)
        asyncExit(null, exitEvent)
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
