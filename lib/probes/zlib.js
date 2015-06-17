var inherits = require('util').inherits
var slice = require('sliced')
var shimmer = require('shimmer')
var Layer = require('../layer')
var tv = require('..')
var conf = tv.zlib

var classes = [
  'Deflate',
  'Inflate',
  'Gzip',
  'Gunzip',
  'DeflateRaw',
  'InflateRaw',
  'Unzip'
]

var methods = [
  'deflate',
  'deflateRaw',
  'gzip',
  'gunzip',
  'inflate',
  'inflateRaw',
  'unzip'
]

function descend (name, options) {
  return function (layer) {
    var data = { Operation: name }
    if (options) {
      data.Options = JSON.stringify(options)
    }
    return layer.descend('zlib', data)
  }
}

function wrapClass (proto, name) {
  function done (err) {
    this.removeListener('close', done)
    this.removeListener('error', done)
    this.removeListener('end', done)

    if (err instanceof Error) {
      this._tv_layer.events.exit.error = err
    }
    this._tv_layer.exit()
  }

  shimmer.wrap(proto, name, function (Real) {
    function Wrapped (options) {
      var real = new Real(options)

      var last = Layer.last
      if (last && conf.enabled && ! real._tv_layer) {
        var layer = descend(name, options)(last)

        real._tv_layer = layer
        layer.async = true
        layer.enter()

        real.once('close', done)
        real.once('error', done)
        real.once('end', done)
      }

      // Terrible hack to make instanceof work
      real.__proto__ = Wrapped.prototype
      return real
    }
    inherits(Wrapped, Real)
    return Wrapped
  })

  var creator = 'create' + name
  proto[creator] = function (options) {
    return new proto[name](options)
  }
}

function wrapMethods (proto, name) {
  if (proto[name]) {
    shimmer.wrap(proto, name, function (fn) {
      return function () {
        var args = slice(arguments)
        var cb = args.pop()
        var self = this

        return tv.instrument(descend(name, args[1]), function (cb) {
          return fn.apply(self, args.concat(cb))
        }, conf, cb)
      }
    })
	}

  var syncMethod = name + 'Sync'
  if (proto[syncMethod]) {
    shimmer.wrap(proto, syncMethod, function (fn) {
      return function () {
        var args = arguments
        var self = this

        return tv.instrument(descend(syncMethod, args[1]), function () {
          return fn.apply(self, args)
        }, conf)
      }
    })
	}
}

module.exports = function (zlib) {
  classes.forEach(function (name) {
    wrapClass(zlib, name)
  })

  methods.forEach(function (method) {
    wrapMethods(zlib, method)
  })

  return zlib
}
