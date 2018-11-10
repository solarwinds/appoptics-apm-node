'use strict'

const shimmer = require('ximmer')
const ao = require('..')

const logMissing = ao.makeLogMissing('mongoose')

module.exports = function (mongoose) {
  // Patch Collection::addQueue
  {
    const proto = mongoose.Collection && mongoose.Collection.prototype
    if (proto) {
      patchAddQueue(proto)
    } else {
      logMissing('Collection.prototype')
    }
  }

  // Patch Schema::addQueue
  {
    const proto = mongoose.Schema && mongoose.Schema.prototype
    if (proto) {
      patchAddQueue(proto)
    } else {
      logMissing('Schema.prototype')
    }
  }

  // Patch Query::exec
  {
    const proto = mongoose.Query && mongoose.Query.prototype
    if (proto) {
      patchExec(proto)
    } else {
      logMissing('Query.prototype')
    }
  }

  // Patch Query.base._wrapCallback
  // Query.base is really mquery's prototype.
  {
    const base = mongoose.Query && mongoose.Query.base
    if (base) {
      patchWrapCallback(base)
    } else {
      logMissing('Query.base')
    }
  }

  // Patch promises unless native JS Promise
  {
    const proto = mongoose.Promise && mongoose.Promise.prototype
    if (proto && mongoose.Promise !== Promise) {
      patchOn(proto)
    } else {
      logMissing('Promise.prototype')
    }
  }

  return mongoose
}

function patchAddQueue (proto) {
  if (typeof proto.addQueue !== 'function') {
    logMissing('addQueue()')
    return
  }
  // NOTE: args may be an arguments object, so [...args] converts to array
  shimmer.wrap(proto, 'addQueue', fn => function (name, [...args]) {
    args.push(ao.bind(args.pop()))
    return fn.call(this, name, args)
  })
}

function patchExec (proto) {
  if (typeof proto.exec !== 'function') {
    logMissing('exec()')
    return
  }
  shimmer.wrap(proto, 'exec', fn => function (op, cb) {
    return fn.call(this, ao.bind(op), ao.bind(cb))
  })
}

function patchWrapCallback (base) {
  if (typeof base._wrapCallback !== 'function') {
    logMissing('_wrapCallback()')
    return
  }
  shimmer.wrap(base, '_wrapCallback', fn => function (method, cb, info) {
    return fn.call(this, method, ao.bind(cb), info)
  })
}

function patchOn (proto) {
  if (typeof proto.on !== 'function') {
    logMissing('on()')
    return
  }
  shimmer.wrap(proto, 'on', fn =>  function (ev, cb) {
    return fn.call(this, ev, ao.lastEvent ? ao.bind(cb) : cb)
  })
}
