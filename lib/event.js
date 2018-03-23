'use strict'

const extend = require('util')._extend
const ao = require('./')
const log = ao.loggers
const addon = ao.addon
const c = addon.Context

log.addGroup({
  groupName: 'event',
  subNames: ['send', 'enter', 'change', 'edge', 'set', 'state']
})

// Export the event class
module.exports = Event

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
  let event

  // create the low level event using bindings functions.
  if (!parent) {
    // start a trace with new context. it also means that a
    // sampling decision needs to be made.
    let sample = true
    // get a sampling decision when there is a layer. if it
    // is a profile then a null layer is passed. there should
    // never be a profile without a parent.
    //
    // this is an odd place (down where an event is created)
    // to make the sampling decision but there are too many
    // interdependencies to unravel to change it now.
    if (layer) {
      sample = ao.sample(layer, '').sample
    } else {
      log.error('Creating Event with neither a parent nor layer.')
    }
    event = addon.Context.startTrace(sample)
    //event.setSampleFlagTo(sample)
  } else {
    // there is a parent so take the sampling state from the
    // parent event.
    let sample
    if (parent.event) {
      // duck-type check for event to use as context
      event = addon.Context.createEventX(parent.event)
      sample = parent.event.getSampleFlag()
    } else {
      // it can be addon.Metadata, addon.Event or String.
      // createEventX will throw if the argument is invalid.
      event = addon.Context.createEventX(parent)
      sample = addon.Metadata.sampleFlagIsSet(parent)
    }
    event.setSampleFlagTo(sample)
  }


  Object.defineProperty(this, 'event', {
    //value: parent ? continueTrace(parent) : startTrace()
    value: event
  })

  if (parent) {
    // it's either a string or a type that can resolve to metadata.
    // remember the parent because createEventX implicitly added
    // the edge.
    parent = parent.event ? parent.event : parent
    Object.defineProperty(this, 'parent', {
      value: parent
    })
    log.event.edge(`${this.event} added edge ${parent}`)
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
    log.event.set(`${this} setting error`)

    // Allow string errors
    if (typeof err === 'string') {
      err = new Error(err)
    }

    if (!(err instanceof Error)) {
      log.event.set(`${this} tried to set error with non-error, non-string type`)
      return
    }

    this.ErrorClass = err.constructor.name
    this.ErrorMsg = err.message
    this.Backtrace = err.stack
    log.event.set(`${this} set error to "${this.ErrorMsg}"`)
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
    return this.event.toString().substr(42, 16)
  }
})

// TODO implement flags getting and setting

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
      log.error(
        'Can not get cls.lastEvent. Context may be lost.'
      )
    }
    return last
  },
  set (value) {
    try {
      ao.requestStore.set('lastEvent', value)
    } catch (e) {
      log.error(
        'Can not set cls.lastEvent. Context may be lost.', e
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
  log.event.enter(`${this} entered`)
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
Event.prototype.sendReport = function (data) {
  // if it's been sent or we're not sampling then
  // just return.
  // TODO BAM this can be optimized in many ways.
  if (this.sent) {
    log.info('event already sent: %e', this)
    return
  }

  // Set data, if supplied
  if (typeof data === 'object') {
    this.set(data)
  }

  // We need to find and restore the context on
  // the JS side before using Reporter.sendReport()
  if (this.parent) {
    log.event.enter('setting context to parent: %e', this.parent)
    addon.Context.set(this.parent)
  }

  if (ao.skipProfiles) {
    if (this.Label === 'profile_entry' || this.Label === 'profile_exit') {
      log.event.enter('skipping profile span')
      return
    }
  }

  // Do not continue from ignored events
  if (!this.ignore) {
    log.event.enter('setting last event to: %e', this)
    Event.last = this
  }

  // if not sampling leave now that Event.last has been set.
  if (!ao.sampling(this)) {
    log.event.enter('not sampling so not sending %e', this)
    return
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
      log.event.change(`{this} set ${key} = ${val}`)
    } catch (e) {
      // don't log null Layer for info events as errors.
      if (key !== 'Layer' || val !== null && this.Label !== 'info') {
        log.error(`failed to set ${key} = ${val} for %e`, this)
      }
    }
  }

  // Mix edges from context object into the event
  const edges = this.edges
  len = edges.length

  for (i = 0; i < len; i++) {
    let edge = edges[i]
    if (!edge) {
      log.error('%e tried to add empty edge', this)
      continue
    }

    if (edge.event) {
      edge = edge.event
    }

    try {
      event.addEdge(edge)
      log.event.edge(`${this} added edge ${edge}`)
    } catch (e) {
      log.error(`%e failed to add edge ${edge}`, this)
    }
  }

  // Send the event
  let status = ao.reporter.sendReport(event)
  if (status < 0) {
    log.error(`%e failed (${status}) to send to reporter`, this)
  } else {
    log.event.send(`${this} sent to reporter`)
  }

  // Mark as sent to prevent double-sending
  Object.defineProperty(this, 'sent', {
    value: true
  })
}

// TODO potentially remove this - used for more than init?
Event.prototype.sendStatus = function (data) {
  let eventReporter = ao.reporter.sendReport
  // substitute the reporter that sends on the status channel
  ao.reporter.sendReport = ao.reporter.sendStatus

  try {
    this.sendReport(data)
  } catch (e) {
    log.error('failed to send status message', e)
  }

  // restore the real event reporter
  ao.reporter.sendReport = eventReporter
}
