'use strict'

const ao = require('..')
const shimmer = require('shimmer')

const logMissing = ao.makeLogMissing('log4.js')

function patchLog (log) {
  // the result of this function is a log4js layout output
  // which is always a string (see https://log4js-node.github.io/log4js-node/layouts.html).
  // first argument received by the log method is the level object which will not be touched.
  // third argument (passThrough) is optional.
  // when it is supplied, it is appended to msg (second argument) using a space.
  return function wrappedLog (_, msg, passThrough) {
    const str = ao.getTraceStringForLog()

    // when no insertion is needed (or when not possible) the returned str will be empty
    // assume that msg is supplied by user as a string
    // else do not insert trace data.
    if (str && typeof msg === 'string') {
      // when passThrough exist, append trace data to it so that insertion does not "break" message.
      // when there is none, append to original message (arguments[2] is ignored in that case)
      if (typeof passThrough === 'string') {
        arguments[2] = `${passThrough} ${str}`
      } else {
        arguments[1] = `${msg} ${str}`
      }
    }

    return log.apply(this, arguments)
  }
}

module.exports = function (log4js, info) {
  if (!ao.probes.log4js.enabled) {
    return log4js
  }

  if (typeof log4js.configure === 'function') {
    shimmer.wrap(log4js, 'configure', function (original) {
      return function wrappedConfigure () {
        // save the applied configuration on the object so it can be read at instantiation time.
        // otherwise it is not currently possible to read what config was applied.
        // side note: can be nice addition to the log4js api.
        this.configuration = arguments[0]
        return original.apply(this, arguments)
      }
    })
  } else {
    logMissing('configure')
  }

  // do not patch the logger constructor if not function or if did not patch the configure method
  if (typeof log4js.getLogger === 'function' && typeof log4js.configure === 'function') {
    // getLogger is called on a configured log4js object
    // wrap the logger instantiation function to get the correct configuration.
    shimmer.wrap(log4js, 'getLogger', function (original) {
      return function wrappedGetLogger () {
        // create an instance
        const instance = original.apply(this, arguments)

        // logging is done by calling a level function (e.g logger.debug('say something'))
        // which then calls the log function, or alternatively, by directly calling the log function.
        // patch the lower level log function to cover all cases (including custom levels).
        if (typeof instance.log === 'function') {
          let appendTraceToEndOfLog = true
          // when the user is using a pattern in their layout in ANY of their appenders respect their pattern (and skill)
          // do NOT append the trace to the end of the log message.
          // (note: inserting for patterns is available using log4js tokens and api method getTraceStringForLog)
          if(this.configuration) {
            appendTraceToEndOfLog = !Object.values(this.configuration.appenders).find(appender => {
              return (
                typeof appender.layout !== 'undefined' &&
                'basic|colored|messagePassThrough|dummy'.indexOf(appender && appender.layout && appender.layout.type) === -1
              )
            })
          }

          if (appendTraceToEndOfLog) {
            shimmer.wrap(instance, 'log', patchLog)
          }
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
