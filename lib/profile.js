var Layer = require('./layer')
var Event = require('./event')
var addon = require('./addon')
var util = require('util')

var inherits = util.inherits
var extend = util._extend

// Export the profile class
module.exports = Profile

/**
 * Create a profile for a layer.
 *
 *     var layer = new Profile('fs', Event.last, {
 *       File: file
 *     })
 *
 * @constructor
 * @class Profile
 * @extends {Layer}
 * @param {String} name Profile name
 * @param {String} parent Event or X-Trace ID to continue from
 * @param {Object} data Key/Value pairs of info to add to event
 */
function Profile (name, parent, data) {
  Layer.call(this, name, parent, data)
}
inherits(Profile, Layer)

/*!
 * Initialize event set for the profile
 */
Profile.prototype.init = function (name, parent, data) {

  // Keep the context clean
  var context = addon.Context.toString()

  // Construct blank entry and exit events.
  var entry = new Event(null, 'profile_entry', parent && context)
  var exit = new Event(null, 'profile_exit', entry.event)

  // Use name for ProfileName instead of Layer,
  // and be sure to apply it to BOTH events.
  var events = [entry, exit]
  events.forEach(function (event) {
    delete event.Layer
    event.ProfileName = name
    event.Language = 'nodejs'
  })

  // Add info to entry event, if available
  extend(entry, data)

  // Store the events for later use
  this.events = {
    entry: entry,
    exit: exit
  }
}


Profile.prototype.__defineSetter__('async', function (val) {
  this._async = val
})
Profile.prototype.__defineGetter__('async', function () {
  return this._async
})
