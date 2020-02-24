'use strict'

const util = require('util');

let ao;
let aob;
let log;

/**
 * Create an event
 *
 * An event is agent metadata with all the KV pairs and edges for the event.
 *
 * @class Event
 * @param {string} span name of the event's span
 * @param {string} label Event label (usually entry or exit)
 * @param {Metabuf} parent Metadata to use to construct the event.
 * @param {boolean} edge Add an edge back to the parent.
 */
function Event (span, label, parent, edge) {
  if (!(parent instanceof ao.MB)) {
    throw new Error('Event() requires parent to be Metadata');
  }

  this.parent = parent;
  this.mb = new ao.MB(parent);

  // All KV pairs become oboe's BSON data and used to be kept as properties on
  // each Event instance. They were distinguished by being enumerable while all
  // private properties were defined using Object.defineProperty(). All KV data
  // is now kept in the kv property to avoid hidden class creation. Layer and
  // Label are so commonly used that they remain direct properties of the Event
  // instances but are duplicated in the kv object so they don't require special
  // treatment.
  this.Layer = span;
  this.Label = label;

  // this used to create an oboe event structure and wrap it in an c++ class called
  // from javascript. that's relatively slow stuff, so now metadata is a Metabuf,
  // a thinly wrapped Buffer with a few additions for formatting and manipulating
  // specific metadata fields, like flags.
  //
  // the metadata is only converted into an oboe event when it is sent.
  //
  // oboe_event_init(&event, &metadata, &opid);         // use my own metadata and op id
  // oboe_event_add_info<type>(& event, key, value);    // for all agent KV & also timestamp & hostname
  // oboe_event_add_edge()         // if required.
  //

  this.ignore = false;
  this.sent = false;
  this._edges = [];
  this.sampling = !!(this.mb.getFlags() & 0x01);

  if (edge) {
    this.addEdge(parent);
    log.event.edge('%e added edge %e', this, parent);
  }

  // object where kv pairs are stored now.
  this.kv = {
    Layer: span,
    Label: label,
    Timestamp_u: ao.getUnixTimeMicroSeconds(),
  };

  log.event.create('created event %e', this);
}

Event.prototype.toString = function toString (bits) {
  return Event.mb.toString(bits);
}

Event.prototype.addEdge = function addEdge (edge) {
  if (this.mb.buf.compare(edge.buf, 1, 21, 1, 21) !== 0) {
    // if not sampling log at debug level because the mistmatch doesn't matter.
    const level = this.sampling ? 'error' : 'debug';
    log[level]('task IDs don\'t match this %e vs edge %e)', this, edge);
    return false;
  }
  this._edges.push(edge);
  return true;
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
    return this.mb.toString(2)
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
    return this.mb.toString(4)
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
      log.error('Lost context %e %s', value, e.stack.toString())
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
      const type = Number.isNaN(data[k]) ? 'NaN' : typeof data[k]
      const stack = ao.stack(`Invalid type for KV ${k}: ${type}`);
      log.error(stack);
    }
  }
}


/**
 * Enter the context of this event
 *
 * @method Event#enter
 */
Event.prototype.enter = util.deprecate(function () {
  log.event.enter(`${this} entered`);
}, 'Event.prototype.enter() is deprecated; it is now a no-op');

/**
 * Get the X-Trace ID string of the event
 *
 * @method Event#toString
 */
Event.prototype.toString = function () {
  return this.mb.toString()
}

/**
 * Send this event to the reporter
 *
 * @method Event#send
 * @param {object} data - additional key-value pairs to send
 */
Event.prototype.send = function (kvpairs) {
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
  if (!this.sampling) {
    log.event.enter('not sampling so not sending %e', this)
    return
  }

  // Set data, if supplied
  if (typeof kvpairs === 'object') {
    this.set(kvpairs)
  }

  // pass this object to C++ code where it will be transformed into the form
  // required by oboe and then sent.
  const result = aob.Event.send(this);

  // status will change dramatically - similar to sendMetrics() - multiple errors
  // can be returned.
  if (result.status !== true) {
    log.error('event.send(%e) failed', this, result.errors);
    //log.error(`%e failed (${status}) to send to reporter`, this)
  } else {
    log.event.send('sent to reporter => %e', this)
  }

  this.sent = true
}

// TODO potentially remove this - used for more than init?
Event.prototype.sendStatus = function (kvpairs) {

  // store the kvpairs in the event
  this.set(kvpairs);

  try {
    aob.Event.send(this, true);
  } catch (e) {
    log.error('failed to send status message', e)
  }
}

Event.init = function (populatedAo) {
  ao = populatedAo;
  aob = ao.addon;
  log = ao.loggers;

  log.addGroup({
    groupName: 'event',
    subNames: ['create', 'send', 'enter', 'change', 'edge', 'set', 'state']
  });
}

module.exports = Event;

