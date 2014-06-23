var debug = require('debug')('node-oboe:__init')
var cls = require('continuation-local-storage')
var oboe = require('./addon')
require('./require-patch')
var os = require('os')


//
// Abstract settings with setters and getters
//
var traceMode, sampleRate
var modeMap = {
  through: oboe.TRACE_THROUGH,
  always: oboe.TRACE_ALWAYS,
  never: oboe.TRACE_NEVER
}

// Adjust tracing mode
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

// Adjust sample rate
Object.defineProperty(exports, 'sampleRate', {
  get: function () { return sampleRate },
  set: function (value) {
    oboe.Context.setDefaultSampleRate(value)
    sampleRate = value
  }
})

// Sugar to detect if the current mode is of a particular type
Object.keys(modeMap).forEach(function (mode) {
  Object.defineProperty(exports, mode, {
    get: function () { return traceMode === mode }
  })
})


//
// Set default settings
//
exports.traceMode = 'through'
exports.sampleRate = oboe.MAX_SAMPLE_RATE


//
// Create reporter instance
//
Object.defineProperty(exports, 'reporter', {
  value: new oboe.UdpReporter('127.0.0.1')
})


//
// Use continuation-local-storage to follow traces through a request
//
var requestStore = cls.createNamespace('oboe-request-store')
Object.defineProperty(exports, 'requestStore', {
  value: requestStore
})

// Track last trace in a request
Object.defineProperty(exports, 'trace', {
  get: function () {
    return requestStore.get('trace')
  },
  set: function (value) {
    requestStore.get('trace', value)
  }
})

// Detect if there is a running trace
Object.defineProperty(exports, 'tracing', {
  get: function () { return !!exports.trace }
})


//
// Some helper methods
//
exports.sample = sample
function sample (layer, xtrace, meta) {
  var rv = oboe.Context.sampleRequest(layer, xtrace || '', meta || '')
  return rv !== 0 && rv
}

function addInfo (event, data) {
  Object.keys(data).forEach(function (key) {
    event.addInfo(key, data[key])
  })
}

exports.setContext = setContext
function setContext (context) {
  oboe.Context.set(context.toString())
  debug('set context to ' + context.toString())
}





// TODO:
// - Handle nesting properly
// - Add info event method?
exports.trace = trace
function trace (layer, handler) {
  var entry, exit

  handler(onEntry, onExit)

  function onEntry (data, edge) {
    if (entry) return
    data = data || {}
    data.Layer = layer
    data.Label = 'entry'

    // If the context is valid, continue tracing
    if (oboe.Context.isValid()) {
      entry = oboe.Context.createEvent()
      debug('continued trace("' + layer + '") with ' + entry.toString())

    // Otherwise, start a new trace
    } else {
      entry = oboe.Context.startTrace()
      debug('started trace("' + layer + '") with ' + entry.toString())
    }

    if (edge && edge.toString() !== oboe.Context.toString()) {
      entry.addEdge(edge)
    }

    // Add KV data to the event
    addInfo(entry, data)

    entry.send = function () {
      reporter.sendReport(entry)
      debug(data.Layer + " " + data.Label + " sent: " + entry.toString())
    }

    return entry
  }

  function onExit (data, edge) {
    if (exit) return
    data = data || {}
    data.Layer = layer
    data.Label = 'exit'

    // Make sure we switch back to the right context.
    // This is important because, with asynchrony,
    // other requests may have rewritten the context.
    if (edge) {
      setContext(edge)
    }

    // Create exit event linked to the entry event
    // TODO: This needs to change to add edge for nested exits
    exit = oboe.Context.createEvent()
    debug('ended trace("' + layer + '") with ' + exit.toString())

    // Add entry edge, if it's not already there from contextual edge
    if (oboe.Context.toString() !== entry.toString()) {
      exit.addEdge(entry)
      debug('added edge ' + entry.toString() + ' to ' + exit.toString())
    }

    // Add KV data to the event
    addInfo(exit, data)

    exit.send = function () {
      reporter.sendReport(exit)
      debug(data.Layer + " " + data.Label + " sent: " + exit.toString())
      // oboe.Context.clear()
    }

    return exit
  }
}



// Async traces are made from a double trace.
// One represents the call time and another represents the callback time.
exports.asyncTrace = function (type, handler) {
  trace(type, function (entry, exit) {
    trace(type + ' (callback)', function (asyncEntry, asyncExit) {
      var entryEvent, asyncEntryEvent, asyncExitEvent

      function wrappedEntry (data, edge) {
        entryEvent = entry(data, edge)
        return entryEvent
      }

      function wrappedAsyncEntry (data) {
        asyncEntryEvent = asyncEntry(data, entryEvent)
        return asyncEntryEvent
      }

      function wrappedAsyncExit (data) {
        asyncExitEvent = asyncExit(data, asyncEntryEvent)
        return asyncExitEvent
      }

      function wrappedExit (data) {
        return exit(data, asyncExitEvent)
      }

      handler(wrappedEntry, wrappedAsyncEntry, wrappedAsyncExit, wrappedExit)
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
