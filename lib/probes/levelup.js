var requirePatch = require('../require-patch')
var argsToArray = require('sliced')
var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('..')
var conf = tv.levelup

module.exports = function (levelup) {
  var Batch = requirePatch.relativeRequire('levelup/lib/batch')
  patch(levelup.prototype)
  patchBatch(levelup.prototype, Batch)
  return levelup
}

function patch (levelup) {
  var continuations = ['open','close']
  var operations = ['get','put','del']

  continuations.forEach(function (method) {
    shimmer.wrap(levelup, method, function (fn) {
      return function (callback) {
        if (callback) {
          callback = tv.requestStore.bind(callback)
        }
        return fn.call(this, callback)
      }
    })
  })

  operations.forEach(function (method) {
    shimmer.wrap(levelup, method, function (fn) {
      return function (key) {
        var args = argsToArray(arguments)
        var callback = args.pop()
        var run = fn.bind.apply(fn, [this].concat(args))

        var layer
        tv.instrument(function (last) {
          layer = last.descend('levelup', {
            Spec: 'cache',
            KVOp: method,
            KVKey: key,
          })
          return layer
        }, function (callback) {
          run(method !== 'get' ? callback : function (err, res) {
            layer.events.exit.KVHit = typeof res !== 'undefined'
            callback(err, res)
          })
        }, conf, callback)
      }
    })
  })
}

function patchBatch (levelup, Batch) {
  shimmer.wrap(levelup, 'batch', function (fn) {
    return function () {
      var args = argsToArray(arguments)
      if ( ! args.length) {
        return new Batch(this, this._codec)
      }

      var callback = args.pop()
      var run = fn.bind.apply(fn, [this].concat(args))

      return tv.instrument(function (last) {
        // Build op and key lists
        var ops = JSON.stringify(args[0].map(getOp))
        var keys = JSON.stringify(args[0].map(getKey))

        return last.descend('levelup', {
          Spec: 'cache',
          KVOp: 'batch',
          KVKeys: keys,
          KVOps: ops,
        })
      }, function (callback) {
        run(callback)
      }, conf, callback)
    }
  })

  shimmer.wrap(Batch.prototype, 'write', function (fn) {
    return function () {
      var args = argsToArray(arguments)
      var callback = args.pop()
      var run = fn.bind.apply(fn, [this].concat(args))
      var self = this

      return tv.instrument(function (last) {
        // Build op and key lists
        var ops = JSON.stringify(self.ops.map(getOp))
        var keys = JSON.stringify(self.ops.map(getKey))

        return last.descend('levelup', {
          Spec: 'cache',
          KVOp: 'batch',
          KVKeys: keys,
          KVOps: ops,
        })
      }, function (callback) {
        run(callback)
      }, conf, callback)
    }
  })
}

function getOp (op) {
  return op.type
}

function getKey (op) {
  return op.key
}
