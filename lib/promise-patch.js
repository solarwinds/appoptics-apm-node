var requestStore = require('./').requestStore
var inherits = require('util').inherits
var shimmer = require('shimmer')
var slice = require('sliced')

shimmer.wrap(global, 'Promise', function (Promise) {
  function binder (fn) {
    var ctx = this
    return function (val) {
      ctx._bound = ctx._bound || requestStore.active
        ? requestStore.bind(indirector)
        : indirector

      return fn.call(this, val)
    }
  }

  function indirector (fn, result) {
    return fn.call(this, result)
  }

  function runner (fn) {
    var ctx = this
    return typeof fn !== 'function' ? fn : function (val) {
      return ctx._bound ? ctx._bound.call(this, fn, val) : fn.call(this, val)
    }
  }

  function WrappedPromise (fn) {
    if ( ! (this instanceof global.Promise)) {
      return Promise(fn)
    }

    var args
    var promise = new Promise(function () {
      args = slice(arguments)
    })

    fn.apply(this, args.map(binder, promise))

    return promise
  }
  inherits(WrappedPromise, Promise)

  shimmer.wrap(Promise.prototype, 'then', function (then) {
    return function () {
      return then.apply(this, slice(arguments).map(runner, this))
    }
  })

  var methods = ['all', 'defer', 'race', 'reject', 'resolve']
  methods.forEach(function (key) {
    WrappedPromise[key] = Promise[key]
  })

  return WrappedPromise
})
