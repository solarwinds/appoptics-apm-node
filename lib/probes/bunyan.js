'use strict'

const ao = require('..')

const shimmer = require('shimmer')
const semver = require('semver')

const logMissing = ao.makeLogMissing('bunyan')

function patchEmit (_emit) {
  return function emitWithLogObject (rec, noemit) {
    ao.insertLogObject(rec)
    return _emit.apply(this, arguments)
  }
}

module.exports = function (bunyan, info) {
  if (!ao.probes.bunyan.enabled) {
    return bunyan
  }

  if (semver.gte(info.version, '1.0.0')) {
    if (typeof bunyan.prototype._emit === 'function') {
      shimmer.wrap(bunyan.prototype, '_emit', patchEmit)
    } else {
      logMissing('prototype._emit()')
    }
  }
  return bunyan
}
