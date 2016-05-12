'use strict'

const WeakMap = require('es6-weak-map')
const {inherits} = require('util')
const shimmer = require('shimmer')
const tv = require('..')
const Layer = tv.Layer
const conf = tv.zlib

const classes = [
  'Deflate',
  'Inflate',
  'Gzip',
  'Gunzip',
  'DeflateRaw',
  'InflateRaw',
  'Unzip'
]

const methods = [
  'deflate',
  'deflateRaw',
  'gzip',
  'gunzip',
  'inflate',
  'inflateRaw',
  'unzip'
]

function descend (name, options) {
  return layer => {
    const data = { Operation: name }
    if (options) {
      data.Options = JSON.stringify(options)
    }
    return layer.descend('zlib', data)
  }
}

const layers = new WeakMap()

function wrapClassEmit (proto) {
  if (typeof proto.emit !== 'function') return
  shimmer.wrap(proto, 'emit', fn => function (name, err) {
    try {
      if (0 !== ~['close', 'error', 'end'].indexOf(name)) {
        const layer = layers.get(this)
        if (layer) {
          if (err) layer.events.exit.error = err
          layers.delete(this)
          layer.exit()
        }
      }
    } catch (e) {}
    return fn.apply(this, arguments)
  })
}

function wrapConstructor (proto, name) {
  if (typeof proto[name] !== 'function') return
  shimmer.wrap(proto, name, Real => {
    function WrappedZlib (options) {
      try {
        const last = Layer.last
        if (last && conf.enabled && !layers.get(this)) {
          const layer = descend(name, options)(last)
          layers.set(this, layer)
          layer.async = true
          layer.enter()
        }
      } catch (e) {}

      Real.call(this, options)
    }
    inherits(WrappedZlib, Real)
    wrapClassEmit(WrappedZlib.prototype)
    return WrappedZlib
  })
}

function wrapCreator (proto, name) {
  const creator = 'create' + name
  if (typeof proto[creator] !== 'function') return
  proto[creator] = function (options) {
    return new proto[name](options)
  }
}

function wrapClass (proto, name) {
  wrapConstructor(proto, name)
  wrapCreator(proto, name)
}

function wrapMethods (proto, name) {
  if (typeof proto[name] === 'function') {
    shimmer.wrap(proto, name, fn => function (...args) {
      const cb = args.pop()
      return tv.instrument(
        descend(name, args[1]),
        cb => fn.apply(this, args.concat(cb)),
        conf,
        cb
      )
    })
  }

  const syncMethod = name + 'Sync'
  if (typeof proto[syncMethod] === 'function') {
    shimmer.wrap(proto, syncMethod, fn => function () {
      return tv.instrument(
        descend(syncMethod, arguments[1]),
        () => fn.apply(this, arguments),
        conf
      )
    })
  }
}

module.exports = function (zlib) {
  classes.forEach(name => wrapClass(zlib, name))
  methods.forEach(method => wrapMethods(zlib, method))
  return zlib
}
