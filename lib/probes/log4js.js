'use strict'

const ao = require('..')
const shimmer = require('shimmer')

const logMissing = ao.makeLogMissing('log4.js')

function patchLevel (level) {
  // the result of this function is a log4js layout output 
  // which is always a string (see https://log4js-node.github.io/log4js-node/layouts.html).
  // passThrough (second argument) is optional.
  // when it is supplied, it is appended to msg (first argument) using a space.
  return function LogWithLogObject (msg, passThrough) {
    const obj = ao.insertLogObject()
    // when no insertion is needed (or not possible) - returned obj will not have sw key
    // we also assume that msg is supplied by user as a string 
    // else we do not insert trace data.
    if (obj.sw && typeof msg === 'string') {
      const str = Object.entries(obj.sw).map(([k, v]) => `${k}=${v}`).join(' ')

      // when passThrough exist append trace data to it so that it does not "break" message.
      // when there is none - append to original message (arguments[1] is ignored in that case)
      if (typeof passThrough === 'string') {
        arguments[1] = `${passThrough} ${str}`
      } else {
        arguments[0] = `${msg} ${str}`
      }
    }

    return level.apply(this, arguments)
  }
}

module.exports = function (log4js, info) {
  if (!ao.probes.log4js.enabled) {
    return log4js
  }

  if (typeof log4js.getLogger === 'function') {
    // getLogger is called on a configured log4js object
    // wrap the logger instantiation function to get the correct configuration.
    shimmer.wrap(log4js, 'getLogger', function (original) {
      return function () {
        // create an instance
        const instance = original.apply(this, arguments)

        // logging is done by calling a level function (e.g logger.debug('say something'))
        // extract the defined levels (including custom ones) and patch each
        // if none exist (e.g. because package changed) log error.
        const levels = Object.values(log4js.levels.levels || {})
        if (levels.length) {
          levels.map(item => item.levelStr.toLowerCase())
            .forEach(level => {
              shimmer.wrap(instance, level, patchLevel)
            })
        } else {
          logMissing('levels')
        }

        return instance
      }
    })
  } else {
    logMissing('getLogger()')
  }

  return log4js
}
