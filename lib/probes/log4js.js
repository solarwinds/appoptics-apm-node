'use strict'

const ao = require('..')
const shimmer = require('shimmer')

const logMissing = ao.makeLogMissing('log4.js')

function patchLevel (level) {
  return function LogWithLogObject (msg, passThrough) {
    const obj = ao.insertLogObject()
    // when no insertion is needed (or possible) returned obj will not have sw key

    // the result is log4js layout output as string (see https://log4js-node.github.io/log4js-node/layouts.html)
    // if it is supplied passThrough (second argument) is appended to msg (first argument) using a space

    // we assume that msg is a string else we do not insert trace data.
    if (obj.sw && typeof msg === 'string') {
      const str = Object.entries(obj.sw).map(([k, v]) => `${k}=${v}`).join(' ')

      // when passThrough exist append trace data to it so that it does not "break" message
      // when there is none - append to original message
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