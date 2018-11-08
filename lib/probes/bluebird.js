'use strict'

const shimmer = require('ximmer')
const ao = require('..')
const log = ao.loggers

function patchAddCallbacks (proto) {
  if (typeof proto._addCallbacks !== 'function') {
    log.patching('bluebird.prototype._addCallbacks not a function')
    return
  }
  // function _addCallbacks():
  //
  // args < v3
  // fulfill - function/undefined
  // reject - function/undefined
  // progress - function/undefined
  // promise - instance of Promise
  // receiver - {}
  // domain - null
  //
  // args >= v3
  // fulfill - function/undefined
  // reject - function/undefined
  // promise - instance of Promise
  // receiver - object
  // domain
  shimmer.wrap(proto, '_addCallbacks', fn => {
    return function () {
      const args = [...arguments]
      // if tracing bind callbacks to the CLS contextn
      if (ao.lastEvent) {
        for (let i = 0; i < args.length; i++) {
          if (typeof args[i] === 'function') {
            args[i] = ao.bind(args[i])
          }
        }
      }
      return fn.apply(this, args)
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
