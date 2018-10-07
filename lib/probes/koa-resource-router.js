'use strict'

//const shimmer = require('ximmer')
const ao = require('../')
const Span = ao.Span
const conf = ao.probes['koa-resource-router']

module.exports = function (Resource) {
  return function (name, obj) {
    const resource = new Resource(name, obj)

    // Patch all available routes
    try {
      resource.routes.forEach(route => {
        patch(route, resource.name, getName(resource, route))
      })
    } catch (e) {}

    return resource
  }
}

// Determine action name from action table
function getName (resource, route) {
  return Object.keys(resource.actions)
    .filter(action => resource.actions[action] === route.action)
    .shift()
}

// Replace action handler
function patch (route, Controller, Action) {
  route.action = wrap(Controller, Action, route.action)
}

// Make an action handler wrapper
function wrap (Controller, Action, fn) {
  return function* (next) {
    // Check if there is a trace to continue
    const last = Span.last
    if (!last || !conf.enabled) {
      return yield fn.call(this, next)
    }

    let span
    try {
      // Build controller/action data, assign to http
      // span exit, and reate koa-route profile
      const data = {Controller, Action}
      this.res._ao_http_span.events.exit.set(data)
      span = last.profile(`${Controller} ${Action}`, data)
    } catch (e) {}

    // Enter, run and exit
    if (span) span.enter()
    const res = yield fn.call(this, next)
    if (span) span.exit()
    return res
  }
}
