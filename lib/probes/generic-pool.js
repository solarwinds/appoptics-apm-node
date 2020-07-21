'use strict'

const shimmer = require('ximmer')
const ao = require('..')
const log = ao.loggers

const semver = require('semver')
const nodeVersion = semver.major(process.version)

const logMissing = ao.makeLogMissing('generic-pool')

module.exports = function (gp, info) {
  const version = info.version;
  const majorVersion = semver.major(version);
  if (majorVersion >= 3 && nodeVersion >= 8) {
    // version 3 is a major overhaul. only patch it if running node version 8.
    // https://github.com/coopernurse/node-pool/blob/master/CHANGELOG.md
    if (typeof gp.Pool === 'function') {
      patchPool3(gp)
    } else {
      logMissing('(v3) createPool()')
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
    log.patching(`generic-pool - not patching version ${version}`);
  }

  return gp
}

//
// v2
//
function patchPool2 (proto) {
  if (typeof proto.Pool !== 'function') {
    logMissing('Pool()')
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
    logMissing('acquire()')
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
    logMissing('createPool()')
    return
  }

  if (typeof gp.Pool.prototype.acquire !== 'function' || typeof gp.Pool.prototype.release !== 'function') {
    logMissing('acquire()/release()')
    return
  }

  shimmer.wrap(gp, 'createPool', original => function () {
    // create the pool then patch the functions that acquire and release
    // pooled resources. they return promises so they need to be bound to
    // appoptics cls context.
    const pool = original.apply(this, arguments)

    if (pool.acquire) {
      shimmer.wrap(pool, 'acquire', fn => function () {
        const bound = ao.bind(fn)
        return bound.apply(this, arguments)
      })
    } else {
      logMissing('pool.acquire()')
    }

    if (pool.release) {
      shimmer.wrap(pool, 'release', fn => function () {
        const bound = ao.bind(fn)
        return bound.apply(this, arguments)
      })
    } else {
      logMissing('pool.release()')
    }

    return pool
  })
}
