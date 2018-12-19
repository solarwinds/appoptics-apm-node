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
  /* I cannot find a version of mongoose that has an addQueue function on Schema.
  {
    const proto = mongoose.Schema && mongoose.Schema.prototype
    if (proto) {
      patchAddQueue(proto)
    } else {
      logMissing('Schema.prototype')
    }
  }
  // */

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
    } else if (!proto) {
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
  //
  // there might not be a callback, so check that?
  // - replace name with a small closure function. Collection.doQueue()
  // checks to see if the "name" is really a function and calls it directly
  // if it is. the callback alone is not sufficient because that will not
  // propagate the context to mongodb-core.
  // - check to verify that this[name] is a valid function; if not then
  // it's probably next just to leave it as it is.
  //
  shimmer.wrap(proto, 'addQueue', fn => function (name, args) {
    // first bind the callback if present
    const l = args.length - 1
    if (typeof args[l] === 'function') {
      args[l] = ao.bind(args[l])
    }
    // if a function then replace name with a bound function
    if (typeof this[name] === 'function') {
      const n = name
      name = ao.bind(() => {
        return this[n].apply(this, args)
      })
    }
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
