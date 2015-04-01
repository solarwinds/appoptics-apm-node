var shimmer = require('shimmer')
var tv = require('..')

module.exports = function (bluebird) {
  shimmer.wrap(bluebird.prototype, '_addCallbacks', function (fn) {
    return function (fulfill, reject, progress, promise, receiver) {
      if (typeof fulfill === 'function') {
        fulfill = tv.requestStore.bind(fulfill)
      }
      if (typeof reject === 'function') {
        reject = tv.requestStore.bind(reject)
      }
      if (typeof progress === 'function') {
        progress = tv.requestStore.bind(progress)
      }
      
      return fn.call(
        this,
        fulfill,
        reject,
        progress,
        promise,
        receiver
      )
    }
  })

  return bluebird
}
