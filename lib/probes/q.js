var shimmer = require('shimmer')
var tv = require('..')

module.exports = function (q) {
  shimmer.wrap(q.makePromise.prototype, 'then', function (then) {
    return function (fulfilled, rejected, progressed) {
      if (typeof fulfilled === 'function') {
        fulfilled = tv.requestStore.bind(fulfilled)
      }
      if (typeof rejected === 'function') {
        rejected = tv.requestStore.bind(rejected)
      }
      if (typeof progressed === 'function') {
        progressed = tv.requestStore.bind(progressed)
      }

      return then.call(this, fulfilled, rejected, progressed)
    }
  })

  return q
}
