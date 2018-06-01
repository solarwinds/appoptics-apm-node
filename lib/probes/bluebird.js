'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const log = ao.loggers

function patchAddCallbacks (proto) {
  if (typeof proto._addCallbacks !== 'function') {
    log.patching('bluebird.prototype._addCallbacks not a function')
    return
  }
  shimmer.wrap(proto, '_addCallbacks', fn => {
    return function (fulfill, reject, progress, promise, receiver, domain) {
      return fn.call(
        this,
        ao.bind(fulfill),
        ao.bind(reject),
        ao.bind(progress),
        promise,
        receiver,
        domain
      )
    }
  })
}

module.exports = function (bluebird) {
  if (bluebird.prototype) {
    patchAddCallbacks(bluebird.prototype)
  } else {
    log.patching('bluebird.prototype not found')
  }
  return bluebird
}
