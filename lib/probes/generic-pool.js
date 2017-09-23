'use strict'

const shimmer = require('shimmer')
const ao = require('..')

module.exports = function (gp) {
  const proto = gp.Pool && gp.Pool.prototype
  if (proto) patchAcquire(proto)
  else patchPool(gp)
  return gp
}

function patchPool (proto) {
  if (typeof proto.Pool !== 'function') return
  shimmer.wrap(proto, 'Pool', fn => function (factory) {
    const pool = fn.call(this, factory)
    patchAcquire(pool)
    return pool
  })
}

function patchAcquire (proto) {
  if (typeof proto.acquire !== 'function') return
  shimmer.wrap(proto, 'acquire', fn => function (callback, priority) {
    return fn.call(this, ao.bind(callback), priority)
  })
}
