var cls = require('continuation-local-storage')
var Emitter = require('events').EventEmitter
var inherits = require('util').inherits
var addon = require('./addon')
var oboe = require('./')




function Layer (name, xtrace) {
  this.parent = oboe.trace

  // Continue tracing, if we have an X-Trace ID.
  if (xtrace) {
    addon.Context.set(xtrace)
  }

  // Construct blank entry and exit events.
  var entry = addon.Context.createEvent()
  var exit = addon.Context.createEvent()

  if (this.parent) {
    entry.addEdge(this.parent.events.entry)
  }

  // Clear the context
  addon.Context.clear()

  // Store the events for later use
  this.events = {
    entry: entry,
    exit: exit
  }

  // Propagate unwind events back up the stack
  // to send exit events in the right order.
  this.on('unwind', function () {
    this.exit()
    if (this.parent) {
      this.parent.emit('unwind')
    }
  })
}
inherits(Layer, Emitter)

// Run a synchronous function within the context of this layer.
// NOTE: This is external to the constructor to support async.
Layer.prototype.run = function (fn) {
  this.enter()
  fn.call(this)

  // If no async ops
  if (this.children.length === 0) {
    this.emit('unwind')
  }
}

Layer.prototype.bind = function (fn) {
  return this.run.bind(this, fn)
}

// Trigger the enter
Layer.prototype.enter = function () {
  oboe.trace = this
}

// Trigger the exit
Layer.prototype.exit = function () {
  this.emit('unwind')
  if (this.parent) {
    this.parent.exit()
  }
}








module.exports = Tracer

function Tracer (parent, layer, opts) {
  opts = opts || {}

  Tracer.current = this

  // Non-enumerable edge list
  Object.defineProperty(this, 'edges', {
    value: []
  })

  // Non-enumerable children list
  Object.defineProperty(this, 'children', {
    value: []
  })

  // Non-enumerable parent pointer
  if (parent) {
    this.edges.push(parent)
    // Object.defineProperty(this, 'parent', {
    //   value: parent
    // })
    // parent.children.push(this)
  }

  // Non-enumerable layer
  Object.defineProperty(this, 'layer', {
    value: layer
  })

  // Non-enumerable event
  var event = addon.Context.isValid()
    ? addon.Context.createEvent()
    : addon.Context.startTrace()

  Object.defineProperty(this, 'event', {
    value: event
  })

  // Ensure the context is emptied before anything in the next tick
  process.nextTick(function () {
    addon.Context.clear()
  })
}
inherits(Tracer, Emitter)


//
// Instance methods
//
Tracer.prototype.continue = function (layer, opts) {
  return new Tracer(this, layer, opts)
}

// Switch to the current context and run a sync method within it
Tracer.prototype.run = function (fn) {
  addon.Context.set(this.event.toString())
  fn()
  addon.Context.clear()
}

Tracer.prototype.send = function () {
  if ( ! Tracer.reporter) {
    throw new Error('Reporter not set')
  }

  // Add KV data
  Object.keys(this).forEach(function (key) {
    this.event.addInfo(key, this[key])
  }, this)

  // Add edges
  this.edges.forEach(function (edge) {
    this.event.addEdge(edge.toString())
  }, this)

  // Send report
  Tracer.reporter.sendReport(this.event)
}

Tracer.prototype.unwind = function () {

}


//
// Class methods
//
Tracer.start = function (layer, opts) {
  opts = opts || {}
  if (oboe.sample(layer, opts.xtrace, opts.meta)) {
    return new Tracer(null, layer, opts)
  }
}

Tracer.continue = function (layer, opts) {
  return Tracer.current.continue(layer, opts)
}

//
// Sample
//
var httpEntry = Tracer.start('http')
httpEntry.url = '/'
httpEntry.send()

var mongoEntry = Tracer.continue('mongo')
mongoEntry.collection = 'users'
mongoEntry.send()
