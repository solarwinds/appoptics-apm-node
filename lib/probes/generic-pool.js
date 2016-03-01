var shimmer = require('shimmer')
var tv = require('..')

module.exports = function (genericPool) {
  if (genericPool.Pool.prototype.acquire) {
    patchAcquire(genericPool.Pool.prototype)
  } else {
    patchPool(genericPool)
  }

  return genericPool
}

function patchPool (obj) {
  shimmer.wrap(obj, 'Pool', function (fn) {
    return function (factory) {
      var pool = fn.call(this, factory)
      patchAcquire(pool)
      return pool
    }
  })
}

function patchAcquire (obj) {
  shimmer.wrap(obj, 'acquire', function (fn) {
    return function (callback, priority) {
      if (tv.tracing) {
        callback = tv.requestStore.bind(callback)
      }
      return fn.call(this, callback, priority)
    }
  })
}
