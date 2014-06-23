var extend = require('util')._extend
var addon = require('./addon')
var oboe = require('./')

// Export the event class
module.exports = Event

/**
 * NOTE:
 * - This is not context safe. You must manage context externally.
 * - Uses lazy-assignment to defer info changes on native event until send.
 */
function Event (layer, label) {
  Object.defineProperty(this, 'event', {
    value: addon.Context.createEvent()
  })
  addon.Context.set(this.event)

  Object.defineProperty(this, 'edges', {
    value: []
  })

  this.Layer = layer
  this.Label = label
}

/**
 * Enter the context of this event
 */
Event.prototype.enter = function () {
  addon.Context.set(this.event)
}

/**
 * Exit the context of this event
 */
Event.prototype.exit = function () {
  addon.Context.clear()
}

/**
 * Send this event to the reporter
 */
Event.prototype.send = function () {
  var event = this.event

  // Mix data from the context object into the event
  var keys = Object.keys(this)
  var len = keys.length
  var key
  var i

  for (i = 0; i < len; i++) {
    key = keys[i]
    event.addInfo(key, this[key])
  }

  // Mix edges from context object into the event
  var edges = this.edges
  len = edges.length

  for (i = 0; i < len; i++) {
    event.addEdge(edges[i].event)
  }

  // Send the event
  oboe.reporter.sendReport(event)
}
