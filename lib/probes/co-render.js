'use strict'

const rum = require('../rum')
const ao = require('..')
const Span = ao.Span
const conf = ao.probes['co-render']

module.exports = function (render) {
  return function (view, opts) {
    const ret = render(view, opts)

    return function* () {
      // Check if there is a trace to continue
      const last = Span.last
      if (!last || !conf.enabled) {
        return yield ret
      }

      let span
      try {
        // Add rum data, when enabled
        if (ao.rumId) {
          const topSpan = ao.requestStore.get('topSpan')
          rum.inject(opts || {}, ao.rumId, topSpan.events.exit)
        }

        // Create co-render span
        span = last.descend('co-render', {
          TemplateFile: view,
          TemplateLanguage: opts.engine,

          // TODO: Disable for now. Maybe include behind config flag later.
          // Locals: JSON.stringify(options || {})
        })
      } catch (e) {}

      // Enter, run and exit
      if (span) span.enter()
      const res = yield ret
      if (span) span.exit()
      return res
    }
  }
}
