var debug = require('debug')('traceview:layer')
var Event = require('./event')
var util = require('./util')
var tv = require('./')
var addon = tv.addon

// Export the layer class
module.exports = Layer

// NOTE: This needs to be after the module.exports
var Profile = require('./profile')

/**
 * Create an execution layer.
 *
 *     var layer = new Layer('fs', Event.last, {
 *       File: file
 *     })
 *
 * @class Layer
 * @constructor
 * @param {String} name Layer name
 * @param {String} parent Event or X-Trace ID to continue from
 * @param {Object} data Key/Value pairs of info to add to event
 */
function Layer (name, parent, data) {
  this.descended = false
  this._async = false
  this.name = name
  this.events = {
    internal: [],
    entry: null,
    exit: null
  }

  try {
    // If we have a parent, set it to be the context
    if (typeof parent === 'string') {
      addon.Context.set(parent)
      debug('contuining ' + name + ' layer from ' + parent)
    } else if (parent && parent.event) {
      this.parent = parent
      parent.enter()
      debug('contuining ' + name + ' layer from ' + parent.event)
    }
  } catch (e) {
    debug(this.name + ' layer failed to set parent', e.stack)
  }

  // Init is outside constructor because
  // Profile inherits Layer and overrides it
  try {
    this.init(name, parent, data)
  } catch (e) {
    debug(this.name + ' layer failed to init')
  }
}

/*!
 * Initialize event set for the layer
 */
Layer.prototype.init = function (name, parent, data) {
  // Keep the context clean
  var context = addon.Context.toString()

  // Construct blank entry and exit events.
  var entry = new Event(name, 'entry', parent && context)
  var exit = new Event(name, 'exit', entry.event)

  // Add info to entry event, if available
  entry.set(data)

  // Store the events for later use
  this.events.entry = entry
  this.events.exit = exit
}

/**
 * Find the last entered layer in the active context
 *
 * @property last
 * @type {Layer}
 */
Object.defineProperty(Layer, 'last', {
  get: function () {
    var last
    try {
      last = tv.requestStore.get('lastLayer')
    } catch (e) {
      debug('Can not access continuation-local-storage. Context may be lost.')
    }
    return last
  },
  set: function (value) {
    try {
      tv.requestStore.set('lastLayer', value)
    } catch (e) {
      debug('Can not access continuation-local-storage. Context may be lost.')
    }
  }
})

/**
 * Create a new layer descending from the current layer
 *
 *     var inner = outer.descend('fs', {
 *       File: file
 *     })
 *
 * @method descend
 * @param {String} name Layer name
 * @param {Object} data Key/Value pairs of info to add to event
 */
Layer.prototype.descend = function (name, data) {
  debug('descending ' + name + ' layer from ' + Event.last.event)
  var layer = new Layer(name, Event.last, data)
  layer.descended = true
  return layer
}

/**
 * Create a new profile from the current layer
 *
 *     var inner = outer.profile('fs', {
 *       File: file
 *     })
 *
 * @method profile
 * @param {String} name Layer name
 * @param {Object} data Key/Value pairs of info to add to event
 */
Layer.prototype.profile = function (name, data) {
  debug('descending ' + name + ' profile from ' + Event.last.event)
  var profile = new Profile(name, Event.last, data)
  profile.descended = true
  return profile
}

/**
 * Add a setter/getter to flag a layer as async
 *
 * @property async
 * @type {Boolean}
 */
Object.defineProperty(Layer.prototype, 'async', {
  set: function (val) {
    try {
      this._async = val
      if (val) {
        this.events.entry.Async = true
      } else {
        delete this.events.entry.Async
      }
      debug(this.name + ' layer ' + (val ? 'enabled' : 'disabled') + ' async')
    } catch (e) {
      debug(this.name + ' layer failed to set async to ' + val, e.stack)
    }
  },
  get: function () {
    return this._async
  }
})

/**
 * Run a function within the context of this layer. Similar to mocha, this
 * identifies asynchrony by function arity and delegates to runSync or runAsync
 *
 *     layer.run(function () {
 *       syncCallToTrace()
 *     })
 *
 *     layer.run(function (wrap) {
 *       asyncCallToTrace(wrap(callback))
 *     })
 *
 * @method run
 * @param {Function} fn A function to run withing the layer context
 */
Layer.prototype.run = function (fn) {
  return fn.length === 1 ? this.runAsync(fn) : this.runSync(fn)
}

/**
 * Run an async function within the context of this layer.
 *
 *     layer.runAsync(function (wrap) {
 *       asyncCallToTrace(wrap(callback))
 *     })
 *
 * @method runAsync
 * @param {Function} fn An async function to run withing the layer context
 */
Layer.prototype.runAsync = function (fn) {
  this.async = true
  var layer = this
  var ctx

  try {
    ctx = tv.requestStore.createContext()
    tv.requestStore.enter(ctx)
  } catch (e) {
    debug(this.name + ' layer failed to enter context', e.stack)
  }

  layer.enter()
  var ret = fn.call(layer, function (cb, handler) {
    return tv.requestStore.bind(function (err) {
      if (handler) {
        handler.apply(this, arguments)
      } else {
        layer.exitWithError(err)
      }
      return cb.apply(this, arguments)
    })
  })

  try {
    tv.requestStore.exit(ctx)
  } catch (e) {
    debug(layer.name + ' layer failed to exit context', e.stack)
  }

  return ret
}

/**
 * Run a sync function within the context of this layer.
 *
 *     layer.runSync(function () {
 *       syncCallToTrace()
 *     })
 *
 * @method runSync
 * @param {Function} fn A sync function to run withing the layer context
 */
Layer.prototype.runSync = function (fn) {
  var ctx = null
  try {
    if ( ! this.descended) {
      ctx = tv.requestStore.createContext()
      tv.requestStore.enter(ctx)
    }
  } catch (e) {
    debug(this.name + ' layer failed to enter context', e.stack)
  }

  this.enter()
  try {
    return fn.call(this)
  } catch (err) {
    this.setExitError(err)
    throw err
  } finally {
    this.exit()
    try {
      if (ctx) {
        tv.requestStore.exit(ctx)
      }
    } catch (e) {
      debug(this.name + ' layer failed to exit context', e.stack)
    }
  }
}

/**
 * Send the enter event
 *
 *     layer.enter()
 *     syncCallToTrace()
 *     layer.exit()
 *
 *     // If using enter/exit to trace async calls, you must flag it as async
 *     // manually and bind the callback to maintain the trace context
 *     layer.asyc = true
 *     layer.enter()
 *     asyncCallToTrace(tv.bind(function (err, res) {
 *       layer.exit()
 *       callback(err, res)
 *     }))
 *
 * @method enter
 * @param {Object} data Key/Value pairs of info to add to event
 */
Layer.prototype.enter = function (data) {
  debug(this.name + ' layer entered call')

  try {
    Layer.last = this
    var entry = this.events.entry

    // Send the entry event
    entry.send(data)
  } catch (e) {
    debug(this.name + ' layer failed to enter', e.stack)
  }
}

/**
 * Send the exit event
 *
 * @method exit
 * @param {Object} data Key/Value pairs of info to add to event
 */
Layer.prototype.exit = function (data) {
  debug(this.name + ' layer exited call')

  try {
    var exit = this.events.exit

    // Edge back to previous event, if not already connected
    var last = Event.last
    if (last && last !== this.events.entry && ! exit.ignore) {
      exit.edges.push(last)
    } else {
      debug(exit + ' no extra edge found')
    }

    // Send the exit event
    exit.send(data)
  } catch (e) {
    debug(this.name + ' layer failed to exit', e.stack)
  }
}

/**
 * Send the exit event
 *
 * @method exitWithError
 * @param {Error} err Error to add to event
 * @param {Object} data Key/Value pairs of info to add to event
 */
Layer.prototype.exitWithError = function (error, data) {
  this.setExitError(error)
  this.exit(data)
}

/**
 * Set an error to be sent with the exit event
 *
 * @method setExitError
 * @param {Error} err Error to add to event
 */
Layer.prototype.setExitError = function (error) {
  try {
    var error = util.toError(error)
    if (error) this.events.exit.error = error
  } catch (e) {
    debug(this.name + ' layer failed to set exit error', e.stack)
  }
}

/*!
 * Create and send an internal event
 *
 *     layer._internal('info', { Foo: 'bar' })
 *
 * @method _internal
 * @param {String} label Event type label
 * @param {Object} data Key/Value pairs to add to event
 */
Layer.prototype._internal = function (label, data) {
  var last = Event.last
  if ( ! last) {
    debug(this.name + ' layer ' + label + ' call could not find last event')
    return
  }

  var event = new Event(null, label, last)
  this.events.internal.push(event)

  // Send the exit event
  event.send(data)
}

/**
 * Create and send an info event
 *
 *     layer.info({ Foo: 'bar' })
 *
 * @method info
 * @param {Object} data Key/Value pairs to add to event
 */
Layer.prototype.info = function (data) {
  debug(this.name + ' layer info call')

  try {
    // Skip sending non-objects
    if ( ! isRealObject(data)) {
      debug('invalid input to layer.info(...)')
      return
    }

    this._internal('info', data)
  } catch (e) {
    debug(this.name + ' layer failed to send info event', e.stack)
  }
}

// Helper to identify object literals
function isRealObject (v) {
 return Object.prototype.toString.call(v) === '[object Object]'
}

/**
 * Create and send an error event
 *
 *     layer.error(error)
 *
 * @method error
 * @param {Object} data Key/Value pairs to add to event
 */
Layer.prototype.error = function (error) {
  debug(this.name + ' layer error call')

  try {
    error = util.toError(error)
    if ( ! error) {
      debug('invalid input to layer.error(...)')
      return
    }

    this._internal('error', { error: error })
  } catch (e) {
    debug(this.name + ' layer failed to send error event', e.stack)
  }
}
