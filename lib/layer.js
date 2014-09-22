var debug = require('debug')('traceview:layer')
var extend = require('util')._extend
var Event = require('./event')
var addon = require('./addon')
var tv = require('./')

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
  data = data || {}
  this.name = name

  // If we have a parent, set it to be the context
  if (typeof parent === 'string') {
    addon.Context.set(parent)
    debug('contuining ' + name + ' layer from ' + parent)
  } else if (parent && parent.event) {
    this.parent = parent
    parent.enter()
    debug('contuining ' + name + ' layer from ' + parent.event)
  }

  // Init is outside constructor because
  // Profile inherits Layer and overrides it
  this.init(name, parent, data)
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
  extend(entry, data)

  // Store the events for later use
  this.events = {
    entry: entry,
    exit: exit
  }
}

/**
 * Find the last entered layer in the active context
 *
 * @property last
 * @type {Layer}
 */
Layer.__defineGetter__('last', function () {
  var last
  try {
    last = tv.requestStore.get('lastLayer')
  } catch (e) {
    debug('Can not access continuation-local-storage. Context may be lost.')
  }
  return last
})
Layer.__defineSetter__('last', function (value) {
  try {
    tv.requestStore.set('lastLayer', value)
  } catch (e) {
    debug('Can not access continuation-local-storage. Context may be lost.')
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
Layer.prototype.__defineSetter__('async', function (val) {
  this._async = val
  if (val) {
    this.events.entry.Async = true
  } else {
    delete this.events.entry.Async
  }
  debug(this.name + ' layer ' + (val ? 'enabled' : 'disabled') + ' async')
})
Layer.prototype.__defineGetter__('async', function () {
  return this._async
})

/**
 * Run a function within the context of this layer.
 * NOTE: Similar to mocha, this identifies asynchrony by function arity.
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
  this.async = fn.length === 1
  var layer = this
  var run
  var ret

  run = function (action) {
    action()
  }

  // Run outer-most layer within the continuation-local-storage runner
  if ( ! this.descended || this.async) {
    run = function (action) {
      tv.requestStore.run(action)
    }
  }

  // Run the function while pinning sync entry/exit,
  // and supply wrapper to pin async entry/exit
  if (this.async) {
    run(function () {
      layer.enter()
      ret = fn.call(layer, function (cb, data) {
        return tv.requestStore.bind(function (err) {
          if (err && err instanceof Error) {
            layer.events.exit.error = err
          }
          layer.exit(data)
          return cb.apply(this, arguments)
        })
      })
    })

  // Otherwise, just run it as-is
  } else {
    run(function () {
      layer.enter()
      ret = fn.call(layer)
      layer.exit()
    })
  }

  return ret
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
  Layer.last = this
  debug(this.name + ' layer entered call')

  var entry = this.events.entry

  // Mixin data, when available
  extend(entry, data || {})

  // Send the entry event
  entry.send()
}

/**
 * Send the exit event
 *
 * @method exit
 * @param {Object} data Key/Value pairs of info to add to event
 */
Layer.prototype.exit = function (data) {
  debug(this.name + ' layer exited call')

  var exit = this.events.exit

  // Edge back to previous event, if not already connected
  if ( ! this.async && Event.last !== this.events.entry && ! exit.ignore) {
    exit.edges.push(Event.last)
  }

  // Mixin data, when available
  extend(exit, data || {})

  // Send the exit event
  exit.send()
}

/**
 * Create and send an info event
 *
 *     layer.info({ Foo: 'bar' })
 *
 * @method info
 * @param {Object} data Key/Value pairs of info to add to event
 */
Layer.prototype.info = function (data) {
  debug(this.name + ' layer info')

  var entry = this.events.entry
  var exit = this.events.exit
  var event = new Event(entry.Layer, 'info', entry)

  // Edge exit back to this info event
  exit.edges.push(event)

  // Mixin data, when available
  extend(event, data || {})

  // Send the exit event
  event.send()
}
