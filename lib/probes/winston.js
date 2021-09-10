'use strict'

const ao = require('..')

const requirePatch = require('../require-patch')
const shimmer = require('shimmer')
const semver = require('semver')

const logMissing = ao.makeLogMissing('winston')

//
// patch the write function (version 3)
//
function patchWrite (write) {
  return function addTraceId (o, encoding, cb) {
    ao.insertLogObject(o)
    return write.apply(this, arguments)
  }
}

//
// patch the log function (versions 1 & 2)
//
function patchLog (log) {
  if (!ao.probes.winston.enabled) {
    return log
  }

  return function addTraceId (level, message, meta, cb) {
    // if there is an object argument (meta) add the trace ID to it
    for (let i = 0; i < arguments.length; i++) {
      if (typeof arguments[i] === 'object') {
        ao.insertLogObject(arguments[i])
        return log.apply(this, arguments)
      }
    }

    // no meta object so we need to insert one
    cb = arguments[arguments.length - 1]
    const ix = typeof cb === 'function' ? arguments.length - 1 : arguments.length
    Array.prototype.splice.call(arguments, ix, 0, ao.insertLogObject())
    return log.apply(this, arguments)
  }
}

//
// winston doesn't actually patch the winston module at all; it only patches
// winston's logger module. but patching logger is triggered by winston being
// required.
//
module.exports = function (winston, info) {
  if (!ao.probes.winston.enabled) {
    return winston
  }

  requirePatch.disable()
  let target
  try {
    target = requirePatch.relativeRequire('winston/lib/winston/logger.js')
  } catch (e) {
    logMissing('winston prerequisites', e)
  }
  requirePatch.enable()

  if (!target) {
    return winston
  }

  if (semver.gte(info.version, '3.0.0')) {
    if (typeof target.prototype.write === 'function') {
      shimmer.wrap(target.prototype, 'write', patchWrite)
    } else {
      logMissing('Logger.prototype.write()')
    }
  } else if (semver.gte(info.version, '1.0.0')) {
    if (typeof target.Logger.prototype.log === 'function') {
      shimmer.wrap(target.Logger.prototype, 'log', patchLog)
    } else {
      logMissing('logger.Logger.prototype.log()')
    }
  }

  return winston
}
