'use strict'

//const extend = require('util')._extend
const ao = require('./')
const log = ao.loggers
const addon = ao.addon

log.addGroup({
  groupName: 'event',
  subNames: ['send', 'enter', 'change', 'edge', 'set', 'state']
})

// Export the event class
module.exports = Event

/**
 * Create an event
 *
 * @class Event
 * @param {string} span name of the event's span
 * @param {string} label Event label (usually entry or exit)
 * @param {addon.Event|addon.Metadata} parent Metadata to construct the event from.
 * @param {boolean} edge This should edge back to the parent
 */
function Event (span, label, parent, edge) {

  if (!(parent instanceof addon.Event || parent instanceof addon.Metadata)) {
    throw new Error('Event() requires parent argument of correct type')
  }

  // create event using the parent metadata.
  const event = addon.Context.createEventX(parent, !!edge)

  Object.defineProperty(this, 'event', {
    value: event
  })

  if (parent) {
    // it's either a low level Event or Metadata.
    parent = parent.event ? parent.event : parent
    Object.defineProperty(this, 'parent', {
      value: parent
    })
    // addon.createEventX implicitly added the edge.
    log.event.edge(`${this.event} added edge ${parent}`)
  }

  Object.defineProperty(this, '_edges', {
    value: []
  })

  const getEdge = (target, prop) => target[prop]
  const setEdge = (target, prop, val, recv) => {
    if (prop === 'length') {
      target.length = val
      return true
    }
    let taskId = val
    if (val) {
      taskId = (val.event ? val.event : val).toString().slice(2, 42)
    }

    if (this.taskId !== taskId) {
      log.error('task IDs don\'t match (%e vs %e)', this, val)
      return true
    }
    target[prop] = val
    return true
  }

  Object.defineProperty(this, 'edges', {
    value: new Proxy(this._edges, {
      get: getEdge,
      set: setEdge
    })
  })

  // All KV pairs become oboe's BSON data and used to be kept as properties on
  // each Event instance. They were distinguished by being enumerable while all
  // private properties were defined using Object.defineProperty(). All KV data
  // is now kept in the kv property to avoid hidden class creation. Layer and
  // Label are so commonly used that they remain direct properties of the Event
  // instances.
  this.Layer = span
  this.Label = label

  Object.defineProperty(this, 'kv', {
    value: {Layer: span, Label: label}
  })
}

/**
 * The error instance if an error occurs in the event
 *
 * @property {Error} error
 * @memberof Event
 */
Object.defineProperty(Event.prototype, 'error', {
  set (err) {
    log.event.set(`${this} setting error`)

    // Allow string errors
    if (typeof err === 'string') {
      err = new Error(err)
    }

    if (!(err instanceof Error)) {
      log.event.set(`${this} set error with non-error, non-string type`)
      return
    }

    this.kv.ErrorClass = err.constructor.name
    this.kv.ErrorMsg = err.message
    this.kv.Backtrace = err.stack
    log.event.set(`${this} set error to "${this.ErrorMsg}"`)
  }
})

/**
 * Get taskId from native event
 *
 * @property {string} taskId
 * @memberof Event
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
 * @property {string} opId
 * @memberof Event
 * @readOnly
 */
Object.defineProperty(Event.prototype, 'opId', {
  get () {
    return this.event.toString().substr(42, 16)
  }
})

/**
 * The last reported event in the active context
 *
 * @property {Event} Event.last
 */
Object.defineProperty(Event, 'last', {
  get () {
    let last
    try {
      last = ao.requestStore.get('lastEvent')
    } catch (e) {
      log.error('Can not get cls.lastEvent. Context may be lost.')
    }
    return last
  },
  set (value) {
    try {
      ao.requestStore.set('lastEvent', value)
    } catch (e) {
      log.error('Lost context before setting lastEvent %e @ %s', value, e)
    }
  }
})

/**
 * Set key-value pairs on this event
 *
 * @method Event#set
 * @param {object} data Key/Value pairs of info to add to event
 */
Event.prototype.set = function (data) {
  const valid = {string: true, boolean: true, number: true}
  for (const k in data) {
    if (typeof data[k] in valid && !Number.isNaN(data[k])) {
      this.kv[k] = data[k]
    } else if (k === 'error' && data[k] instanceof Error) {
      // use the setter to decompose the error into appropriate keys
      this.error = data[k]
    } else {
      const stack = ao.stack('Invalid type', 25)
      const type = Number.isNaN(data[k]) ? 'NaN' : typeof data[k]
      log.error('Invalid type for KV %s: %s\n%s', k, type, stack)
    }
  }
}

/**
 * Enter the context of this event
 *
 * @method Event#enter
 */
Event.prototype.enter = function () {
  log.event.enter(`${this} entered`)
  addon.Context.set(this.event)
}

/**
 * Get the X-Trace ID string of the event
 *
 * @method Event#toString
 */
Event.prototype.toString = function () {
  return this.event.toString()
}

/**
 * Send this event to the reporter
 *
 * @method Event#sendReport
 * @param {object} data - additional key-value pairs to send
 */
Event.prototype.sendReport = function (data) {
  // if it's been sent there's nothing to do
  if (this.sent) {
    log.debug('event already sent: %e', this)
    return
  }

  // if it's ignored then we can't continue from it, so don't set
  // last event.
  if (!this.ignore) {
    log.event.enter('setting last event to: %e', this)
    Event.last = this
  }

  // if not sampling return now that Event.last has been set (unless ignored).
  if (!this.event.getSampleFlag()) {
    log.event.enter('not sampling so not sending %e', this)
    return
  }

  // Set data, if supplied
  if (typeof data === 'object') {
    this.set(data)
  }

  this.send()
}

Event.prototype.send = function () {
  // find and restore oboe's context on before calling Reporter.sendReport()
  if (this.parent) {
    log.event.enter('setting context to parent: %e', this.parent)
    addon.Context.set(this.parent)
  }

  // Add KV pairs into the low-level oboe context.
  const keys = Object.keys(this.kv)
  const event = this.event
  let len = keys.length
  let i

  for (i = 0; i < len; i++) {
    const key = keys[i]
    const val = this.kv[key]
    try {
      event.addInfo(key, val)
      log.event.change(`{this} set ${key} = ${val}`)
    } catch (e) {
      // don't log null Layer for info events as errors.
      if (key !== 'Layer' || val !== null && this.Label !== 'info') {
        log.error(`failed to set ${key} = ${val} for %e - %s`, this, e.stack)
      }
    }
  }

  // Add any edges into oboe's context.
  const edges = this._edges
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
      log.error(`%e failed to add edge ${edge}`, this, e)
    }
  }

  // Send the event
  const status = ao.reporter.sendReport(event)
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
  const eventReporter = ao.reporter.sendReport
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
