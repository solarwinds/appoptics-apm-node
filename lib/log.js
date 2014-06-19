var extend = require('util')._extend
var addon = require('./addon')
var oboe = require('./')

var invalidKeys = ['Label','Layer','Edge','Timestamp','Timestamp_u']
function validKey (key) {
  return !~invalidKeys.indexOf(key)
}

// Public: Report an event in an active trace.
//
// layer - The layer the reported event belongs to
// label - The label for the reported event. See API documentation for
//         reserved labels and usage.
// opts - A hash containing key/value pairs that will be reported along
//        with this event (optional).
//
// Example
//
//   log('logical_layer', 'entry')
//   log('logical_layer', 'info', { :list_length => 20 })
//   log('logical_layer', 'exit')
//
// Returns nothing.
var log = module.exports = exports = function (layer, label, opts) {
  opts = opts || {}
  log.event(layer, label, addon.Context.createEvent(), opts)
}

// Public: Report an exception.
//
// layer - The layer the reported event belongs to
// exn - The exception to report
//
// Example
//
//   begin
//     function_without_oboe()
//   rescue Exception => e
//     log_exception('rails', e)
//     raise
//   end
//
// Returns nothing.
log.exception = function (layer, err) {
  if ( ! err.oboe_logged) {
    log(layer, 'error', {
      ErrorClass: err.constructor.name,
      Message: err.message,
      Backtrace: err.stack
    })
    err.oboe_logged = true
  }
}

// Public: Decide whether or not to start a trace, and report an event
// appropriately.
//
// layer - The layer the reported event belongs to
// xtrace - An xtrace metadata string, or nil.
// opts - A hash containing key/value pairs that will be reported along
//        with this event (optional).
//
// Returns nothing.
log.start = function (layer, xtrace, opts) {
  opts = opts || {}
  if (oboe.never) return

  if (xtrace) {
    addon.Context.set(xtrace)
  }

  if (oboe.tracing) {
    log.entry(layer, opts)
  } else if (oboe.always && oboe.sample(extend({}, opts, { layer: layer, xtrace: xtrace })) || opts.Force) {
    log.event(layer, 'entry', addon.Context.startTrace(), opts)
  }
}

// Public: Report an exit event.
//
// layer - The layer the reported event belongs to
//
// Returns an xtrace metadata string
log.end = function (layer, opts) {
  opts = opts || {}
  log.event(layer, 'exit', addon.Context.createEvent(), opts)
  var xtrace = addon.Context.toString()
  addon.Context.clear()
  return xtrace
}

log.entry = function (layer, opts, protect_op) {
  opts = opts || {}

  if (protect_op) {
    addon.Context.layer_op = protect_op
  }

  log.event(layer, 'entry', addon.Context.createEvent(), opts)
}

log.exit = function (layer, opts, protect_op) {
  opts = opts || {}

  if (protect_op) {
    delete addon.Context.layer_op
  }

  log.event(layer, 'exit', addon.Context.createEvent(), opts)
}

// Internal: Report an event.
//
// layer - The layer the reported event belongs to
// label - The label for the reported event. See API documentation for
//         reserved labels and usage.
// opts - A hash containing key/value pairs that will be reported along
//        with this event (optional).
//
// Examples
//
//   entry = Oboe::Context.createEvent
//   log_event('rails', 'entry', exit, { :controller => 'user', :action => 'index' })
//   exit = Oboe::Context.createEvent
//   exit.addEdge(entry.getMetadata)
//   log_event('rails', 'exit', exit)
//
// Returns nothing.
log.event = function (layer, label, event, opts) {
  opts = opts || {}
  if (layer) {
    event.addInfo('Layer', layer.toString())
  }
  event.addInfo('Label', label.toString())

  Object.keys(opts).forEach(function (key) {
    if (validKey(key)) {
      event.addInfo(key, opts[key])
    }
  })

  oboe.reporter.sendReport(event)
}
