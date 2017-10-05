'use strict'

const logSend = require('debug')('appoptics:event:send')
const logEnter = require('debug')('appoptics:event:enter')
const logChange = require('debug')('appoptics:event:change')
const logEdge = require('debug')('appoptics:event:edge')
const logError = require('debug')('appoptics:event:error')
const logSet = require('debug')('appoptics:event:set')

const extend = require('util')._extend
const ao = require('./')
const addon = ao.addon

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
  const ctx = addon.Context.toString()

  // Temporarily modify the context
  if (parent.event) {
    parent = parent.event
  }
  addon.Context.set(parent)

  // Create an event in the mofieied context
  const e = addon.Context.createEvent()

  // Restore the original context
  addon.Context.set(ctx)
  return e
}

/**
 * Creates an event
 *
 * @class Event
 * @constructor
 * @param {String} layer name of the event span/layer
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
    logEdge(`${this.event} added edge ${parent}`)
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
Object.defineProperty(Event.prototype, 'error', {
  set (err) {
    logSet(`${this} setting error`)

    // Allow string errors
    if (typeof err === 'string') {
      err = new Error(err)
    }

    if (!(err instanceof Error)) {
      logSet(`${this} tried to set error with non-error, non-string type`)
      return
    }

    this.ErrorClass = err.constructor.name
    this.ErrorMsg = err.message
    this.Backtrace = err.stack
    logSet(`${this} set error to "${this.ErrorMsg}"`)
  }
})

/**
 * Get taskId from native event string
 *
 * @property taskId
 * @type {String}
 * @readOnly
 */
Object.defineProperty(Event.prototype, 'taskId', {
  get () {
    return this.event.toString().substr(2, 40)
  }
})

/**
 * Get opId from native event string
 *
 * @property opId
 * @type {String}
 * @readOnly
 */
Object.defineProperty(Event.prototype, 'opId', {
  get () {
    return this.event.toString().substr(42)
  }
})

/**
 * Find the last reported event in the active context
 *
 * @property last
 * @type {Event}
 */
Object.defineProperty(Event, 'last', {
  get () {
    let last
    try {
      last = ao.requestStore.get('lastEvent')
    } catch (e) {
      logError(
        'Can not access continuation-local-storage. Context may be lost.'
      )
    }
    return last
  },
  set (value) {
    try {
      ao.requestStore.set('lastEvent', value)
    } catch (e) {
      logError(
        'Can not access continuation-local-storage. Context may be lost.'
      )
    }
  }
})

/**
 * Set pairs on this event
 * TODO: Use an internal pairs object to prevent hidden classes?
 * (https://developers.google.com/v8/design#fast-property-access)
 *
 * @method set
 * @param {Object} data Key/Value pairs of info to add to event
 */
Event.prototype.set = function (data) {
  extend(this, data || {})
}

/**
 * Enter the context of this event
 *
 * @method enter
 */
Event.prototype.enter = function () {
  logEnter(`${this} entered`)
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
Event.prototype.send = function (data) {
  if (this.sent) return

  // Set data, if supplied
  if (typeof data === 'object') {
    this.set(data)
  }

  // We need to find and restore the context on
  // the JS side before using Reporter.sendReport()
  if (this.parent) {
    logEnter(`restoring request context to ${this.parent}`)
    addon.Context.set(this.parent)
  }

  // Do not continue from ignored events
  if (!this.ignore) {
    logEnter(`${this} set as last event`)
    Event.last = this
  }

  // Mix data from the context object into the event
  const keys = Object.keys(this)
  const event = this.event
  let len = keys.length
  let i

  for (i = 0; i < len; i++) {
    const key = keys[i]
    const val = this[key]
    try {
      event.addInfo(key, val)
      logChange(`{this} set ${key} = ${val}`)
    } catch (e) {
      logError(`{this} failed to set ${key} = ${val}`)
    }
  }

  // Mix edges from context object into the event
  const edges = this.edges
  len = edges.length

  for (i = 0; i < len; i++) {
    let edge = edges[i]
    if (!edge) {
      logError(`${this} tried to add empty edge`)
      continue
    }

    if (edge.event) {
      edge = edge.event
    }

    try {
      event.addEdge(edge)
      logEdge(`${this} added edge ${edge}`)
    } catch (e) {
      logError(`${this} failed to add edge ${edge}`)
    }
  }

  // Send the event
  let status = ao.reporter.sendReport(event)
  //if (!ao.reporter.sendReport(event)) {
  if (status < 0) {
    logError(`${this} failed (${status}) to send to reporter`)
  } else {
    logSend(`${this} sent to reporter`)
  }

  // Mark as sent to prevent double-sending
  Object.defineProperty(this, 'sent', {
    value: true
  })
}
