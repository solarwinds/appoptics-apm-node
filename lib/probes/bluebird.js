'use strict'

const shimmer = require('shimmer')
const tv = require('..')

function patchAddCallbacks (proto) {
  if (typeof proto._addCallbacks !== 'function') return
  shimmer.wrap(proto, '_addCallbacks', fn => {
    return function (fulfill, reject, progress, promise, receiver, domain) {
      return fn.call(
        this,
        tv.bind(fulfill),
        tv.bind(reject),
        tv.bind(progress),
        promise,
        receiver,
        domain
      )
    }
  })
}

module.exports = function (bluebird) {
  if (bluebird.prototype) patchAddCallbacks(bluebird.prototype)
  return bluebird
}
