'use strict'

const rum = require('../rum')
const ao = require('..')
const Layer = ao.Layer
const conf = ao['co-render']

module.exports = function (render) {
  return function (view, opts) {
    const ret = render(view, opts)

    return function* () {
      // Check if there is a trace to continue
      const last = Layer.last
      if (!last || !conf.enabled) {
        return yield ret
      }

      let layer
      try {
        // Add rum data, when enabled
        if (ao.rumId) {
          const topLayer = ao.requestStore.get('topLayer')
          rum.inject(opts || {}, ao.rumId, topLayer.events.exit)
        }

        // Create co-render layer
        layer = last.descend('co-render', {
          TemplateFile: view,
          TemplateLanguage: opts.engine,

          // TODO: Disable for now. Maybe include behind config flag later.
          // Locals: JSON.stringify(options || {})
        })
      } catch (e) {}

      // Enter, run and exit
      if (layer) layer.enter()
      const res = yield ret
      if (layer) layer.exit()
      return res
    }
  }
}
