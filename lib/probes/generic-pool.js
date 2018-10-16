'use strict'

const shimmer = require('ximmer')
const ao = require('..')
const log = ao.loggers

const requirePatch = require('../require-patch')
const semver = require('semver')
const clientVersion = requirePatch.relativeRequire('generic-pool/package').version
const majorVersion = semver.major(clientVersion)
const nodeVersion = semver.major(process.version)


module.exports = function (gp) {
  if (majorVersion >= 3 && nodeVersion >= 8) {
    // version 3 is a major overhaul. only patch it if running node version 8.
    // TODO BAM should check cls provider instead?
    // https://github.com/coopernurse/node-pool/blob/master/CHANGELOG.md
    if (typeof gp.Pool === 'function') {
      patchPool3(gp)
    } else {
      log.patching('generic-pool v3 - createPool is not a function: %s', typeof gp.createPool)
    }
  } else if (majorVersion < 3) {
    // patch for version 2 regardless of node version
    const proto = gp.Pool && gp.Pool.prototype
    if (proto) {
      patchAcquire(proto)
    } else {
      patchPool2(gp)
    }
  } else {
    log.patching('generic-pool - not patching version ' + clientVersion)
  }

  return gp
}

//
// v2
//
function patchPool2 (proto) {
  if (typeof proto.Pool !== 'function') {
    log.patching('generic-pool - Pool is not a function')
    return
  }
  shimmer.wrap(proto, 'Pool', fn => function (factory) {
    const pool = fn.call(this, factory)
    patchAcquire(pool)
    return pool
  })
}

function patchAcquire (proto) {
  if (typeof proto.acquire !== 'function') {
    log.patching('generic-pool - acquire is not a function')
    return
  }
  shimmer.wrap(proto, 'acquire', fn => function (callback, priority) {
    return fn.call(this, ao.bind(callback), priority)
  })
}

//
// v3
//
function patchPool3 (gp) {
  if (typeof gp.createPool !== 'function') {
    log.patching('generic-pool - createPool is not a function')
    return
  }

  if (typeof gp.Pool.prototype.acquire !== 'function' || typeof gp.Pool.prototype.release !== 'function') {
    log.patching('generic-pool - acquire/release not found on Pool prototypes')
    return
  }

  shimmer.wrap(gp, 'createPool', original => function () {
    // create the pool then patch the functions that acquire and release
    // pooled resources. they return promises so they need to have
    // appoptics cls context.
    const pool = original.apply(this, arguments)

    if (!pool.acquire) {
      log.debug('gp - pool.acquire not found')
      return pool
    }

    shimmer.wrap(pool, 'acquire', fn => function () {
      const bound = ao.bind(fn)
      return bound.apply(this, arguments)
    })

    if (!pool.release) {
      log.debug('gp - pool.release not found')
      return pool
    }

    shimmer.wrap(pool, 'release', fn => function () {
      const bound = ao.bind(fn)
      return bound.apply(this, arguments)
    })

    return pool
  })
}
