'use strict'

const ao = require('..')
const shimmer = require('shimmer')

const logMissing = ao.makeLogMissing('log4js')

function patchLevel (level) {
  return function LogWithLogObject (msg) {
    const obj = ao.insertLogObject()
    if(typeof msg === 'string') {
      arguments[0] = `${msg} ${Object.entries(obj.sw).map(([k, v]) => `${k}=${v}`).join(' ') }`
    } else {
      arguments[0] = {...obj, msg}
    }
    return level.apply(this, arguments)
  }
}

module.exports = function (log4js, info) {
  if (!ao.probes.log4js.enabled) {
    return log4js
  }

  // getLogger is called on a configured log4js object
  // wrap the logger instantiation function to get the correct configuration.
  shimmer.wrap(log4js, 'getLogger' ,function (original) {
    return function () {
      // create an instance
      const instance = original.apply(this, arguments)

      // extract the defined levels (including custom ones) and patch each
      Object.values(log4js.levels.levels)
        .map(item => item.levelStr.toLowerCase())
        .forEach(level => {
          shimmer.wrap(instance, level, patchLevel)
        })

      return instance
    }
  })

  return log4js
}
