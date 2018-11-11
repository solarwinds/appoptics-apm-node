'use strict'

const requirePatch = require('../require-patch')
const shimmer = require('ximmer')
const ao = require('..')
const conf = ao.probes.levelup

module.exports = function (levelup) {
  const proto = levelup.prototype
  if (proto) {
    patch(proto)
  } else {
    ao.loggers.patching('no levelup prototype found')
  }

  let Batch
  try {
    Batch = requirePatch.relativeRequire('levelup/lib/batch')
  }
  catch (e) {

  }
  if (proto && Batch) {
    patchBatch(proto, Batch)
  } else {
    ao.loggers.patching('no levelup Batch object available')
  }

  return levelup
}

function patch (levelup) {
  const continuations = [ 'open', 'close' ]
  const operations = [ 'get', 'put', 'del' ]

  continuations.forEach(method => {
    shimmer.wrap(levelup, method, fn => function (callback) {
      return fn.call(this, ao.lastEvent ? ao.bind(callback) : callback)
    })
  })

  operations.forEach(function (method) {
    shimmer.wrap(levelup, method, function (fn) {
      return patchOperation(method, fn)
    })
  })
}

function patchOperation (method, fn) {
  return function (key, ...args) {
    const callback = args.pop()
    let span

    function wrapCallback (callback) {
      return (err, res) => {
        span.events.exit.KVHit = typeof res !== 'undefined'
        callback(err, res)
      }
    }

    function shouldWrap (method) {
      return span && method === 'get'
    }

    return ao.instrument(
      last => (span = last.descend('levelup', {
        Spec: 'cache',
        KVOp: method,
        KVKey: key,
      })),
      callback => fn.apply(this, [key].concat(
        args,
        shouldWrap(method) ? wrapCallback(callback) : callback
      )),
      conf,
      callback
    )
  }
}

function patchBatch (levelup, Batch) {
  if (typeof levelup.batch === 'function') {
    shimmer.wrap(levelup, 'batch', fn => makeLevelBatchPatch(Batch, fn))
  }
  if (Batch.prototype && typeof Batch.prototype.write === 'function') {
    shimmer.wrap(Batch.prototype, 'write', makeBatchWritePatch)
  }
}

function makeLevelBatchPatch (Batch, fn) {
  return function (...args) {
    if (!args.length) {
      return new Batch(this, this._codec)
    }

    const callback = args.pop()
    return ao.instrument(
      last => last.descend('levelup', {
        Spec: 'cache',
        KVOp: 'batch',
        KVKeys: JSON.stringify(args[0].map(getKey)),
        KVOps: JSON.stringify(args[0].map(getOp))
      }),
      callback => fn.apply(this, args.concat(callback)),
      conf,
      callback
    )
  }
}

function makeBatchWritePatch (fn) {
  return function (...args) {
    const callback = args.pop()
    return ao.instrument(
      last => last.descend('levelup', {
        Spec: 'cache',
        KVOp: 'batch',
        KVKeys: JSON.stringify(this.ops.map(getKey)),
        KVOps: JSON.stringify(this.ops.map(getOp))
      }),
      callback => fn.apply(this, args.concat(callback)),
      conf,
      callback
    )
  }
}

function getOp (op) {
  return op.type
}

function getKey (op) {
  return op.key
}
