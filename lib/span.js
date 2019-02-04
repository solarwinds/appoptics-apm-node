'use strict'

const Event = require('./event')
const ao = require('./')
const addon = ao.addon
const log = ao.loggers

// Export the span class
module.exports = Span


/**
 * Create an execution span.
 *
 * @class Span
 * @param {string} name Span name
 * @param {object} settings Settings returned from getTraceSettings()
 * @param {boolean} [settings.inbound] true if this is a new trace or is continued
 *                                     from an external connection.
 * @param {boolean} [settings.doSample]
 * @param {metadata} [settings.metadata=undefined] if inbound=true metadata else Event.last.
 * @param {object} [data] Key/Value pairs of info to add to event
 *
 * @example
 * var span = new Span('fs', Event.last, {
 *   File: file
 * })
 */
function Span (name, settings, data) {
  this.descended = false
  this._async = false
  this.name = name
  this.events = {
    internal: [],
    entry: null,
    exit: null
  }

  // is this an inbound request, e.g., http/https? if so there is no parent but there might
  // be an inbound x-trace id which is passed in as metadata. if so, use that; if not then
  // make random metadata. set oboe's context to the applicable metadata.
  //
  // if it is not inbound then it must be descending from another span. in that case
  // metadata is the Event.last, i.e., an instance of Appoptics JavaScript Event (not
  // bindings.Event or node's Event).
  try {
    let entryMetadata
    let edge = true        // inbound with no metadata (x-trace id) doesn't edge back.

    if (settings.inbound) {
      this.doSample = settings.doSample
      this.doMetrics = settings.doMetrics

      log.span('building span %s from inbound %x', name, settings.metadata)
      if (settings.metadata) {
        entryMetadata = settings.metadata
      } else {
        entryMetadata = addon.Metadata.makeRandom(settings.doSample)
        edge = false
      }
      // set oboe's context
      addon.Context.set(entryMetadata)

    } else if (settings.descend && settings.metadata.event) {
      this.doSample = settings.metadata.event.getSampleFlag()

      log.span('continuing %s span from event %x', name, settings.metadata.event);
      entryMetadata = settings.metadata.event
      this.parent = settings.metadata
      this.parent.enter()

    } else {
      log.error(`Invalid settings for ${name}: %o`, settings)
    }

    const entry = new Event(name, 'entry', entryMetadata, edge)
    const exit = new Event(name, 'exit', entry.event, true)

    entry.set(data)

    this.events.entry = entry
    this.events.exit = exit
  } catch (e) {
    log.error(`failed to build ${this.name} span`, e)
  }
}

/**
 * The last span that was entered in the active context
 *
 * @property {Span} Span.last
 */
Object.defineProperty(Span, 'last', {
  get () {
    let last
    try {
      last = ao.requestStore.get('lastSpan')
    } catch (e) {
      log.error('Can not get cls.lastSpan. Context may be lost.')
    }
    return last
  },
  set (value) {
    try {
      ao.requestStore.set('lastSpan', value)
    } catch (e) {
      log.error('Can not set cls.lastSpan. Context may be lost.')
    }
  }
})

/**
 * Create a new span descending from the current span
 *
 * @method Span#descend
 * @param {string} name Span name
 * @param {object} data Key/Value pairs of info to add to the entry event
 *
 * @example
 * var inner = outer.descend('fs', {
 *   File: file
 * })
 */
Span.prototype.descend = function (name, data) {
  log.span('descending span %s from Event.last %e', name, Event.last)
  const settings = {metadata: Event.last, descend: true}
  const span = new Span(name, settings, data)
  span.descended = true
  return span
}

/**
 * Whether or not the span is async
 *
 * @property {boolean} async
 * @memberof Span
 */
Object.defineProperty(Span.prototype, 'async', {
  get () { return this._async },
  set (val) {
    try {
      this._async = val
      if (val) {
        this.events.entry.kv.Async = true
      } else {
        delete this.events.entry.kv.Async
      }
      log.span(`${this.name} span ${val ? 'enabled' : 'disabled'} async`)
    } catch (e) {
      log.error(`${this.name} span failed to set async to ${val}`, e.stack)
    }
  }
})

/**
 * Run a function within the context of this span. Similar to mocha, this
 * identifies asynchronicity by function arity and invokes runSync or runAsync
 *
 * @method Span#run
 * @param {function} fn - function to run within the span context
 *
 * @example
 * span.run(function () {
 *   syncCallToTrace()
 * })
 * @example
 * span.run(function (wrap) {
 *   asyncCallToTrace(wrap(callback))
 * })
 */
Span.prototype.run = function (fn) {
  return fn.length === 1 ? this.runAsync(fn) : this.runSync(fn)
}

/**
 * Run an async function within the context of this span.
 *
 * @method Span#runAsync
 * @param {function} fn - async function to run within the span context
 *
 * @example
 * span.runAsync(function (wrap) {
 *   asyncCallToTrace(wrap(callback))
 * })
 */
Span.prototype.runAsync = function (fn) {
  this.async = true
  const span = this
  let ctx
  let startTime
  const kvpairs = {}

  try {
    ctx = ao.requestStore.createContext()
    ao.requestStore.enter(ctx)
  } catch (e) {
    log.error(`${this.name} span failed to enter context`, e.stack)
  }

  if (span.doMetrics) {
    startTime = new Date().getTime()
  }

  span.enter()
  // fn is a function that accepts our wrapper, wraps the user's callback with
  // it, then runs the user's runner function. That way our wrapper is invoked
  // before the user's callback. handler is used only for memcached. No other
  // callback function supplies it.
  const ret = fn.call(span, (cb, handler) => ao.bind(function (err) {
    if (handler) {
      // handler is present only for some memcached functions.
      // TODO BAM how to handle this with customTxName...
      handler.apply(this, arguments)
    } else {
      // this is the "normal", i.e., non-memcached path.

      if (span.doMetrics) {
        const txname = span.getTransactionName()
        const et = (new Date().getTime() - startTime) * 1000
        const finaltxname = Span.sendNonHttpSpan(txname, et, err)
        kvpairs.TransactionName = finaltxname
        if (txname !== finaltxname) {
          log.warn('Span.runAsync txname error: %s !== %s', txname, finaltxname)
        }
      }

      span.exitWithError(err, kvpairs)
    }

    return cb.apply(this, arguments)
  }))

  try {
    ao.requestStore.exit(ctx)
  } catch (e) {
    log.error(`${this.name} span failed to exit context`, e.stack)
  }

  return ret
}

/**
 * Run a sync function within the context of this span.
 *
 * @method Span#runSync
 * @param {function} fn - sync function to run withing the span context
 *
 * @example
 * span.runSync(function () {
 *   syncCallToTrace()
 * })
 */
Span.prototype.runSync = function (fn) {
  let ctx = null
  let error
  let startTime
  const kvpairs = {}

  try {
    if (!this.descended) {
      ctx = ao.requestStore.createContext()
      ao.requestStore.enter(ctx)
    }
  } catch (e) {
    log.error(`${this.name} span failed to enter context`, e.stack)
  }

  if (this.doMetrics) {
    startTime = new Date().getTime()
  }

  this.enter()
  try {
    return fn.call(this)
  } catch (err) {
    error = err
    this.setExitError(err)
    throw err
  } finally {
    if (this.doMetrics) {
      const txname = this.getTransactionName()
      const et = (new Date().getTime() - startTime) * 1000
      const finaltxname = Span.sendNonHttpSpan(txname, et, error)
      kvpairs.TransactionName = finaltxname
      if (txname !== finaltxname) {
        log.warn('Span.runAsync txname error: %s !== %s', txname, finaltxname)
      }
    }

    this.exit(kvpairs)

    try {
      if (ctx) {
        ao.requestStore.exit(ctx)
      }
    } catch (e) {
      log.error(`${this.name} span failed to exit context`, e.stack)
    }
  }
}

/**
 * Send the enter event
 *
 * @method Span#enter
 * @param {object} data - Key/Value pairs of info to add to event
 *
 * @example
 * span.enter()
 * syncCallToTrace()
 * span.exit()
 * @example
 * // If using enter/exit to trace async calls, you must flag it as async
 * // manually and bind the callback to maintain the trace context
 * span.async = true
 * span.enter()
 * asyncCallToTrace(ao.bind(function (err, res) {
 *   span.exit()
 *   callback(err, res)
 * }))
 */
Span.prototype.enter = function (data) {
  log.span('span.enter called %e', this.events.entry);


  try {
    Span.last = this
    const {entry} = this.events

    // Send the entry event
    entry.sendReport(data)
  } catch (e) {
    log.error(`${this.name} span failed to enter`, e.stack)
  }
}

/**
 * Send the exit event
 *
 * @method Span#exit
 * @param {object} data - key-value pairs of info to add to event
 */
Span.prototype.exit = function (data) {
  log.span('span.exit called for %e', this.events.exit);


  try {
    const {exit} = this.events

    // Edge back to previous event, if not already connected
    const {last} = Event
    if (last && last !== this.events.entry && !exit.ignore) {
      exit.edges.push(last)
    } else if (!last) {
      log.debug('exiting span with no last event %l', this)
    } else {
      log.span('no extra edge found for %e', exit)
    }

    // Send the exit event
    exit.sendReport(data)
  } catch (e) {
    log.error(`${this.name} span failed to exit`, e.stack)
  }
}

/**
 * Send the exit event with an error status
 *
 * @method Span#exitWithError
 * @param {Error} err - Error to add to event
 * @param {object} data - Key/Value pairs of info to add to event
 */
Span.prototype.exitWithError = function (error, data) {
  this.setExitError(error)
  this.exit(data)
}

/**
 * Set an error to be sent with the exit event
 *
 * @method Span#setExitError
 * @param {Error} err - Error to add to event
 */
Span.prototype.setExitError = function (error) {
  try {
    error = Span.toError(error)
    if (error) this.events.exit.error = error
  } catch (e) {
    log.error(`${this.name} span failed to set exit error`, e.stack)
  }
}

/**
 * @ignore
 * Create and send an internal event
 *
 *     span._internal('info', { Foo: 'bar' })
 *
 * @method Span#_internal
 * @param {String} label Event type label
 * @param {Object} data Key/Value pairs to add to event
 */
Span.prototype._internal = function (label, data) {
  const {last} = Event
  if (!last) {
    log.error(`${this.name} span ${label} call could not find last event`)
    return
  }

  const event = new Event(null, label, last.event, true)
  this.events.internal.push(event)

  // Send the exit event
  event.sendReport(data)
}

/**
 * Create and send an info event
 *
 * @method Span#info
 * @param {object} data - key-value pairs to add to event
 *
 * @example
 * span.info({Foo: 'bar'})
 */
Span.prototype.info = function (data) {
  log.span(`${this.name} span info call`)

  try {
    // Skip sending non-objects
    if (!isRealObject(data)) {
      log.info('invalid input to span.info(...)')
      return
    }

    this._internal('info', data)
  } catch (e) {
    log.error(`${this.name} span failed to send info event`, e.stack)
  }
}

// Helper to identify object literals
function isRealObject (v) {
  return Object.prototype.toString.call(v) === '[object Object]'
}

/**
 * Create and send an error event
 *
 * @method Span#error
 * @param {object} data Key/Value pairs to add to event
 *
 * @example
 * span.error(error)
 */
Span.prototype.error = function (error) {
  log.span(`${this.name} span error call`)

  try {
    error = Span.toError(error)
    if (!error) {
      log.info('invalid input to span.error(...)')
      return
    }

    this._internal('error', {error: error})
  } catch (e) {
    log.error(`${this.name} span failed to send error event`, e.stack)
  }
}

//
// This is not really associated with a Span now so make it static.
//
Span.sendNonHttpSpan = function (txname, duration, error) {
  const args = {
    txname: txname,
    //domain: ao.cfg.domainPrefix ? ao.getDomainPrefix(req) : '',
    duration: duration,
    error: !!error
  }

  const finalTxName = ao.reporter.sendNonHttpSpan(args)

  return finalTxName
}

//
// Given rootOpts return the transaction name. Only root spans
// have transaction names.
//
Span.prototype.getTransactionName = function () {
  let txname
  if (this.customTxName) {
    if (typeof this.customTxName === 'string') {
      txname = this.customTxName
    } else if (typeof this.customTxName === 'function') {
      try {
        // if the user needs context they need to create a closure.
        txname = this.customTxName()
      } catch (e) {
        log.error('customTxName function %s', e)
      }
    }
  }
  if (!txname) {
    txname = this.defaultTxName
  }
  return txname
}

//
// Convert a string to an error, return an Error instance
// or return undefined.
//
Span.toError = function (error) {
  // error can be a string or Error
  // TODO BAM this contradicts docs "if not error is passed through"

  if (typeof error === 'string') {
    return new Error(error)
  }

  if (error instanceof Error) {
    return error
  }
}
