var logSend = require('debug')('traceview:event:send')
var logEnter = require('debug')('traceview:event:enter')
var logChange = require('debug')('traceview:event:change')
var logEdge = require('debug')('traceview:event:edge')
var logError = require('debug')('traceview:event:error')

var extend = require('util')._extend
var tv = require('./')
var addon = tv.addon

// Export the event class
module.exports = Event

function startTrace () {
  return addon.Context.startTrace()
}

// Create an event from a specific context,
// without global-state side effects.
// We have to create events at weird times,
// so we need to manage linking manually.
function continueTrace (parent) {
  // Store the current context
  var ctx = addon.Context.toString()

  // Temporarily modify the context
  if (parent.event) {
    parent = parent.event
  }
  addon.Context.set(parent)

  // Create an event in the mofieied context
  var e = addon.Context.createEvent()

  // Restore the original context
  addon.Context.set(ctx)
  return e
}

/**
 * Creates an event
 *
 * @class Event
 * @constructor
 * @param {String} name Event name
 * @param {String} label Event label (usually entry or exit)
 * @param {Object} parent Parent event to edge back to
 */
function Event (layer, label, parent) {
  Object.defineProperty(this, 'event', {
    value: parent ? continueTrace(parent) : startTrace()
  })

  if (parent) {
    parent = parent.event ? parent.event : parent
    Object.defineProperty(this, 'parent', {
      value: parent
    })
    logEdge(this.event + ' added edge ' + parent)
  }

  Object.defineProperty(this, 'edges', {
    value: []
  })

  this.Layer = layer
  this.Label = label
}

/**
 * Set this property to an error instance if an error occurs in the event
 *
 * @property error
 * @type {Error}
 */
Event.prototype.__defineSetter__('error', function (err) {
  this.ErrorClass = err.constructor.name
  this.ErrorMsg = err.message
  this.Backtrace = err.stack
})

/**
 * Get taskId from native event string
 *
 * @property taskId
 * @type {String}
 * @readOnly
 */
Event.prototype.__defineGetter__('taskId', function () {
  return this.event.toString().substr(2, 40)
})

/**
 * Get opId from native event string
 *
 * @property opId
 * @type {String}
 * @readOnly
 */
Event.prototype.__defineGetter__('opId', function () {
  return this.event.toString().substr(42)
})

/**
 * Find the last reported event in the active context
 *
 * @property last
 * @type {Event}
 */
Event.__defineGetter__('last', function () {
  var last
  try {
    last = tv.requestStore.get('lastEvent')
  } catch (e) {
    logError('Can not access continuation-local-storage. Context may be lost.')
  }
  return last
})
Event.__defineSetter__('last', function (value) {
  try {
    tv.requestStore.set('lastEvent', value)
  } catch (e) {
    logError('Can not access continuation-local-storage. Context may be lost.')
  }
})

/**
 * Enter the context of this event
 *
 * @method enter
 */
Event.prototype.enter = function () {
  logEnter(this + ' entered')
  addon.Context.set(this.event)
}

/**
 * Get the X-Trace ID string of the event
 *
 * @method toString
 */
Event.prototype.toString = function () {
  return this.event.toString()
}

/**
 * Send this event to the reporter
 *
 * @method send
 */
Event.prototype.send = function () {
  if (this.sent) return

  // We need to find and restore the context on
  // the JS side before using Reporter.sendReport()
  if (this.parent) {
    logEnter('restoring request context to ' + this.parent)
    addon.Context.set(this.parent)
  }

  // Do not continue from ignored events
  if ( ! this.ignore) {
    logEnter(this + ' set as last event')
    Event.last = this
  }

  // Mix data from the context object into the event
  var keys = Object.keys(this)
  var event = this.event
  var len = keys.length
  var key
  var i

  for (i = 0; i < len; i++) {
    key = keys[i]
    var val = this[key]
    try {
      event.addInfo(key, val)
      logChange(this + ' set ' + key + ' = ' + val)
    } catch (e) {
      logError(this + ' failed to set ' + key + ' = ' + val)
    }
  }

  // Mix edges from context object into the event
  var edges = this.edges
  len = edges.length

  for (i = 0; i < len; i++) {
    var edge = edges[i]
    if ( ! edge) {
      logError(this + ' tried to add empty edge')
      continue
    }

    if (edge.event) {
      edge = edge.event
    }

    try {
      event.addEdge(edge)
      logEdge(this + ' added edge ' + edge)
    } catch (e) {
      logError(this + ' failed to add edge ' + edge)
    }
  }

  // Send the event
  if ( ! tv.reporter.sendReport(event)) {
    logError(this + ' failed to send to reporter')
  } else {
    logSend(this + ' sent to reporter')
  }

  // Mark as sent to prevent double-sending
  Object.defineProperty(this, 'sent', {
    value: true
  })
}
