var shimmer = require('shimmer')
var methods = require('methods')
var Layer = require('../layer')

module.exports = function (Resource) {
  return function (name, obj) {
    var resource = new Resource(name, obj)

    var controller = resource.name

    // Iterate through available routes
    resource.routes.forEach(function (route) {
      // Determine action name from action table
      var actionName = Object.keys(resource.actions)
        .filter(function (action) {
          return resource.actions[action] === route.action
        })
        .shift()

      // Replace action handler
      shimmer.wrap(route, 'action', function (action) {
        return function* (next) {
          // Check if there is a trace to continue
          var last = Layer.last
          if ( ! last) {
            return yield action.call(this, next)
          }

          // Build controller/action data
          var data = {
            Controller: controller,
            Action: actionName
          }

          // Assign controller/action to http layer exit
          var exit = this.res._http_layer.events.exit
          exit.Controller = data.Controller
          exit.Action = data.Action

          // Create koa route profile
          var layer = last.profile(controller + ' ' + actionName, data)

          // Enter, run and exit
          layer.enter()
          var res = yield action.call(this, next)
          layer.exit()
          return res
        }
      })
    })

    return resource
  }
}
