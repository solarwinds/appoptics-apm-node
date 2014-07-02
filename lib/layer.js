var debug = require('debug')('node-oboe:layer')
var extend = require('util')._extend
var Event = require('./event')
var addon = require('./addon')
var oboe = require('./')

// Export the layer class
module.exports = Layer

/**
 * Create an execution layer.
 *
 * Usage:
 *
 *   // Sync tracing
 *   fs.readFileSync = (function (func) {
 *     return function () {
 *       var args = Array.prototype.slice.call(arguments)
 *       var buf
 *
 *       var layer = new Layer('fs')
 *       layer.run(function () {
 *         buf = func.apply(null, args)
 *       })
 *
 *       return buf
 *     }
 *   })(fs.readFileSync)
 *
 *   // Async tracing
 *   fs.readFile = (function (func) {
 *     return function () {
 *       var args = Array.prototype.slice.call(arguments)
 *       var cb = args.pop()
 *
 *       var layer = new Layer('fs')
 *       layer.run(function (wrap) {
 *         args.push(wrap(cb))
 *         func.apply(fs, args)
 *       })
 *     }
 *   })(fs.readFile)
 *
 * @class Layer
 * @constructor
 * @param {String} name Layer name
 * @param {String} xtrace X-Trace ID to continue from
 * @param {Object} info Key/Value pairs of info to add to event
 */
function Layer (name, xtrace, data) {
  data = data || {}
  this.callCount = 0
  this.name = name

  // Track the parent layer
  this.parent = oboe.requestStore.get('trace')

  // If we have a parent, set it to be the context
  if (this.parent) {
    var events = this.parent.events
    var parent = this.parent.async ? events.asyncEntry : events.entry
    parent.enter()
    this.parent.callCount++
    debug('contuining ' + name + ' layer from ' + parent.event)

  // Otherwise, continue tracing, if we have an X-Trace ID.
  } else if (xtrace) {
    addon.Context.set(xtrace)
    debug('contuining ' + name + ' layer from ' + xtrace)
  }

  var valid = addon.Context.isValid()
  var context = addon.Context.toString()

  // Construct blank entry and exit events.
  var entry = new Event(name, 'entry', data.__Init || !valid)
  var exit = new Event(name, 'exit')

  if (valid) {
    addon.Context.set(context)
  }

  // Add info to entry event, if available
  extend(entry, data)

  // Store the events for later use
  this.events = {
    entry: entry,
    exit: exit
  }
}

/**
 * Create a new layer descending from the current layer
 *
 * @method descend
 * @param {String} name Layer name
 * @param {String} xtrace X-Trace ID to continue from
 * @param {Object} info Key/Value pairs of info to add to event
 */
Layer.prototype.descend = function (name, xtrace, data) {
  var layer = new Layer(name, xtrace, data)
  layer.events.entry.edges.push(this.events.entry)
  this.events.exit.edges.push(layer.events.exit)
  return layer
}

/**
 * Add a setter/getter to flag a layer as async
 */
Layer.prototype.__defineSetter__('async', function (val) {
  this._async = true
  // this.events.entry.Async = true
  debug('set ' + this.name + ' layer to async mode')

  // Enter the entry event and create callback entry/exit events
  this.events.entry.enter()
  var asyncEntry = new Event(this.name + ' (callback)', 'entry')
  var asyncExit = new Event(this.name + ' (callback)', 'exit')
  asyncEntry.Async = true

  // Link into events list for this layer
  extend(this.events, {
    asyncEntry: asyncEntry,
    asyncExit: asyncExit
  })

  // Add edge to async exit
  this.events.exit.edges.push(asyncExit)
})
Layer.prototype.__defineGetter__('async', function () {
  return this._async
})

/**
 * Run a function within the context of this layer.
 * NOTE: Similar to mocha, this identifies asynchrony by function arity.
 *
 * @method run
 * @param {Function} fn A function to run withing the layer context
 */
Layer.prototype.run = function (fn) {
  this.async = fn.arity === 1
  this.enter()

  // Run the function while pinning sync entry/exit,
  // and supply wrapper to pin async entry/exit
  if (this.async) {
    var layer = this
    fn.call(this, function (cb) {
      return function () {
        layer.asyncEnter()
        var ret = cb.apply(this, arguments)
        layer.asyncExit()
        layer.exit()
        return ret
      }
    })

  // Otherwise, just run it as-is
  } else {
    var ret = fn.call(this)
    this.exit()
    return ret
  }
}

/**
 * Send the enter event
 */
Layer.prototype.enter = function (data) {
  oboe.requestStore.set('trace', this)

  debug(this.name + ' layer entered call')

  var entry = this.events.entry
  // entry.enter()

  // Mixin data, when available
  if (data) {
    extend(entry, data)
  }

  // Send the entry event
  entry.send()
}

/**
 * Send the asyncEnter event
 */
Layer.prototype.asyncEnter = function (data) {
  oboe.requestStore.set('trace', this)

  debug(this.name + ' layer entered callback')

  var asyncEntry = this.events.asyncEntry
  // asyncEntry.enter()

  // Mixin data, when available
  if (data) {
    extend(asyncEntry, data)
  }

  // Send the asyncEntry event
  asyncEntry.send()
}

/**
 * Trigger the exit
 */
Layer.prototype.exit = function (data) {
  debug(this.name + ' layer exited call')

  var exit = this.events.exit
  // exit.enter()

  // Mixin data, when available
  if (data) {
    extend(exit, data)
  }

  // Send the exit event
  exit.send()

  // Auto-unwind sync calls
  if (this.parent && this.parent.callCount === 0) {
    this.parent.exit()
  }
}

/**
 * Trigger the asyncExit
 */
Layer.prototype.asyncExit = function (data) {
  debug(this.name + ' layer exited callback')

  var asyncExit = this.events.asyncExit
  // asyncExit.enter()

  // Mixin data, when available
  if (data) {
    extend(asyncExit, data)
  }

  // Send the exit event
  asyncExit.send()

  // Auto-update reference counter for async calls, and unwind when empty
  if (this.parent) {
    this.parent.callCount--
    if (this.parent.callCount === 0) {
      this.parent.exit()
    }
  }
}
