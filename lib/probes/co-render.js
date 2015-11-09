var shimmer = require('shimmer')
var methods = require('methods')
var Layer = require('../layer')
var rum = require('../rum')
var tv = require('..')
var conf = tv['co-render']

module.exports = function (render) {
  return function (view, opts) {
    var ret = render(view, opts)

    return function* () {
      // Check if there is a trace to continue
      var last = Layer.last
      if ( ! last || ! conf.enabled) {
        return yield ret
      }

      // Add rum data, when enabled
      if (tv.rumId) {
        var topLayer = tv.requestStore.get('topLayer')
        rum.inject(opts || {}, tv.rumId, topLayer.events.exit)
      }

      // Create co-render layer
      var layer = last.descend('co-render', {
        TemplateFile: view,
        TemplateLanguage: opts.engine,

        // TODO: Disable for now. Maybe include behind config flag later.
        // Locals: JSON.stringify(options || {})
      })

      // Enter, run and exit
      layer.enter()
      var res = yield ret
      layer.exit()
      return res
    }
  }
}
