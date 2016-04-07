'use strict'

const shimmer = require('shimmer')
const tv = require('..')

function patchThen (proto) {
  if (typeof proto.then !== 'function') return
  shimmer.wrap(proto, 'then', then => function (...args) {
    return then.apply(this, args.map(tv.bind))
  })
}

module.exports = function (q) {
  const proto = q.makePromise && q.makePromise.prototype
  if (proto) patchThen(proto)
  return q
}
