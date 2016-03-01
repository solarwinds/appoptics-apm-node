var inherits = require('util').inherits
var shimmer = require('shimmer')
var tv = require('..')

module.exports = function (mongoose) {
  patchCollectionAddQueue(mongoose)
  patchSchemaAddQueue(mongoose)
  patchExec(mongoose)
  patchWrapCallback(mongoose)
  patchOn(mongoose)

  return mongoose
}

function patchCollectionAddQueue (mongoose) {
  if ( ! mongoose.Collection) return
  if ( ! mongoose.Collection.prototype) return
  if ( ! mongoose.Collection.prototype.addQueue) return
  patchAddQueue(mongoose.Collection.prototype)
}

function patchSchemaAddQueue (mongoose) {
  if ( ! mongoose.Schema) return
  if ( ! mongoose.Schema.prototype) return
  if ( ! mongoose.Schema.prototype.addQueue) return
  patchAddQueue(mongoose.Schema.prototype)
}

function patchAddQueue (obj) {
  shimmer.wrap(obj, 'addQueue', function (addQueue) {
    return function (name, args) {
      var last = args[args.length - 1]
      if (typeof last === 'function') {
        args[args.length - 1] = tv.requestStore.bind(last)
      }
      return addQueue.call(this, name, args)
    }
  })
}

function patchExec (mongoose) {
  if ( ! mongoose.Query) return
  if ( ! mongoose.Query.prototype) return
  if ( ! mongoose.Query.prototype.exec) return

  shimmer.wrap(mongoose.Query.prototype, 'exec', function (exec) {
    return function (op, callback) {
      if (typeof op == 'function') {
        op = tv.requestStore.bind(op)
      }
      if (typeof callback == 'function') {
        callback = tv.requestStore.bind(callback)
      }
      return exec.call(this, op, callback)
    }
  })
}

function patchWrapCallback (mongoose) {
  if ( ! mongoose.Query) return
  if ( ! mongoose.Query.base) return
  if ( ! mongoose.Query.base._wrapCallback) return

  shimmer.wrap(mongoose.Query.base, '_wrapCallback', function (_wrapCallback) {
    return function (method, callback, queryInfo) {
      if (typeof callback == 'function') {
        callback = tv.requestStore.bind(callback)
      }
      return _wrapCallback.call(this, method, callback, queryInfo)
    }
  })
}

function patchOn (mongoose) {
  if ( ! mongoose.Promise) return
  if ( ! mongoose.Promise.prototype) return
  if ( ! mongoose.Promise.prototype.on) return

  shimmer.wrap(mongoose.Promise.prototype, 'on', function (on) {
    return function (event, callback) {
      if (typeof callback == 'function') {
        callback = tv.requestStore.bind(callback)
      }
      return on.call(this, event, callback)
    }
  })
}
