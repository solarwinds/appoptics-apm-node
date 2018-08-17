'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const log = ao.loggers

const requirePatch = require('../require-patch')
const semver = require('semver')
const clientVersion = requirePatch.relativeRequire('generic-pool/package').version
const majorVersion = semver.major(clientVersion)

module.exports = function (gp) {
  // version 3 is a major overhaul. see:
  // https://github.com/coopernurse/node-pool/blob/master/CHANGELOG.md
  if (majorVersion < 3) {
    const proto = gp.Pool && gp.Pool.prototype
    if (proto) {
      patchAcquire(proto)
    } else {
      patchPool(gp)
    }
  } else {
    // if it's not a function there is nothing to do
    if (typeof gp.createPool !== 'function') {
      log.patching('generic-pool v3 - createPool is not a function: %s', typeof gp.createPool)
      return
    }

    patchCreatePool(gp)
  }
  return gp
}

//
// v2
//
function patchPool (proto) {
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
function patchCreatePool (gp) {
  if (typeof gp.createPool !== 'function') {
    log.patching('generic-pool - createPool is not a function')
    return
  }

  if (typeof gp.Pool.prototype.acquire !== 'function' || typeof gp.Pool.prototype.release !== 'function') {
    log.patching('generic-pool - acquire/release not found on prototype')
    return
  }

  shimmer.wrap(gp, 'createPool', original => function (factory, config) {
    // create the pool then patch the functions that acquire and release
    // pooled resources. they return promises so they need to have
    // appoptics cls context.
    const pool = original.call(this, factory, config)

    shimmer.wrap(pool, 'acquire', fn => function () {
      const bound = ao.bind(fn)
      return bound.call(this)
    })

    shimmer.wrap(pool, 'release', fn => function (resource) {
      const bound = ao.bind(fn)
      return bound.call(this, resource)
    })

    return pool
  })
}
