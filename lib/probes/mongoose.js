'use strict'

const shimmer = require('ximmer')
const ao = require('..')
const log = ao.loggers

module.exports = function (mongoose) {
  // Patch Collection::addQueue
  {
    const proto = mongoose.Collection && mongoose.Collection.prototype
    if (proto) {
      patchAddQueue(proto)
    } else {
      log.patching('mongoose.%s.prototype not found', 'Collection')
    }
  }

  // Patch Schema::addQueue
  {
    const proto = mongoose.Schema && mongoose.Schema.prototype
    if (proto) {
      patchAddQueue(proto)
    } else {
      log.patching('mongoose.%s.prototype not found', 'Schema')
    }
  }

  // Patch Query::exec
  {
    const proto = mongoose.Query && mongoose.Query.prototype
    if (proto) {
      patchExec(proto)
    } else {
      log.patching('mongoose.%s.prototype not found', 'Query')
    }
  }

  // Patch Query.base._wrapCallback
  // Query.base is really mquery's prototype.
  {
    const base = mongoose.Query && mongoose.Query.base
    if (base) {
      patchWrapCallback(base)
    } else {
      log.patching('mongoose.%s.prototype not found', 'Query.base')
    }
  }

  // Patch promises
  {
    const proto = mongoose.Promise && mongoose.Promise.prototype
    if (proto) {
      patchOn(proto)
    } else {
      log.patching('mongoose.%s.prototype not found', 'Promise')
    }
  }

  return mongoose
}

function patchAddQueue (proto) {
  if (typeof proto.addQueue !== 'function') {
    log.patching('mongoose %s not a function', 'addQueue')
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
    log.patching('mongoose %s not a function', 'exec')
    return
  }
  shimmer.wrap(proto, 'exec', fn => function (op, cb) {
    return fn.call(this, ao.bind(op), ao.bind(cb))
  })
}

function patchWrapCallback (base) {
  if (typeof base._wrapCallback !== 'function') {
    log.patching('mongoose %s not a function', '_wrapCallback')
    return
  }
  shimmer.wrap(base, '_wrapCallback', fn => function (method, cb, info) {
    return fn.call(this, method, ao.bind(cb), info)
  })
}

function patchOn (proto) {
  if (typeof proto.on !== 'function') {
    log.patching('mongoose %s not a function', 'on')
    return
  }
  shimmer.wrap(proto, 'on', fn =>  function (ev, cb) {
    return fn.call(this, ev, ao.bind(cb))
  })
}
