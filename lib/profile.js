'use strict'

const inherits = require('util').inherits
const Layer = require('./layer')
const Event = require('./event')
const ao = require('./')
const addon = ao.addon

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
  const context = addon.Context.toString()

  // Construct blank entry and exit events.
  const entry = new Event(null, 'profile_entry', parent && context)
  const exit = new Event(null, 'profile_exit', entry.event)

  // Use name for ProfileName instead of Layer,
  // and be sure to apply it to BOTH events.
  const events = [entry, exit]
  events.forEach(event => {
    delete event.Layer
    event.ProfileName = name
    event.Language = 'nodejs'
  })

  // Add info to entry event, if available
  entry.set(data)

  // Store the events for later use
  this.events.entry = entry
  this.events.exit = exit
}

Object.defineProperty(Profile.prototype, 'async', {
  get () { return this._async },
  set (val) { this._async = val }
})
