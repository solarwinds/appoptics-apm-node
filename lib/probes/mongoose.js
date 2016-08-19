'use strict'

const shimmer = require('shimmer')
const tv = require('..')

module.exports = function (mongoose) {
  // Patch Collection::addQueue
  {
    const proto = mongoose.Collection && mongoose.Collection.prototype
    if (proto) patchAddQueue(proto)
  }

  // Patch Schema::addQueue
  {
    const proto = mongoose.Schema && mongoose.Schema.prototype
    if (proto) patchAddQueue(proto)
  }

  // Patch Query::exec
  {
    const proto = mongoose.Query && mongoose.Query.prototype
    if (proto) patchExec(proto)
  }

  // Patch Query.base._wrapCallback
  {
    const base = mongoose.Query && mongoose.Query.base
    if (base) patchWrapCallback(base)
  }

  // Patch promises
  {
    const proto = mongoose.Promise && mongoose.Promise.prototype
    if (proto) patchOn(proto)
  }

  return mongoose
}

function patchAddQueue (proto) {
  if (typeof proto.addQueue !== 'function') return
  // NOTE: args may be an arguments object, so [...args] converts to array
  shimmer.wrap(proto, 'addQueue', fn => function (name, [...args]) {
    args.push(tv.bind(args.pop()))
    return fn.call(this, name, args)
  })
}

function patchExec (proto) {
  if (typeof proto.exec !== 'function') return
  shimmer.wrap(proto, 'exec', fn => function (op, cb) {
    return fn.call(this, tv.bind(op), tv.bind(cb))
  })
}

function patchWrapCallback (base) {
  if (typeof base._wrapCallback !== 'function') return
  shimmer.wrap(base, '_wrapCallback', fn => function (meth, cb, info) {
    return fn.call(this, meth, tv.bind(cb), info)
  })
}

function patchOn (proto) {
  if (typeof proto.on !== 'function') return
  shimmer.wrap(proto, 'on', fn =>  function (ev, cb) {
    return fn.call(this, ev, tv.bind(cb))
  })
}
