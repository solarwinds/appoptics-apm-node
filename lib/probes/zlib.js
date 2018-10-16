'use strict'

const WeakMap = require('es6-weak-map')
const {inherits} = require('util')
const shimmer = require('ximmer')
const ao = require('..')
const Span = ao.Span
const conf = ao.probes.zlib
const log = ao.loggers

// turn this on for debugging checks and output.
const debugging = false

const nodeVersion = +process.version.slice(1, process.version.indexOf('.'))

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
  return span => {
    const data = {Operation: name}
    if (options) {
      data.Options = JSON.stringify(options)
    }
    return span.descend('zlib', data)
  }
}

const spans = new WeakMap()

function wrapClassEmit (proto) {
  if (typeof proto.emit !== 'function') {
    log.patching('zlib.prototype.emit not a function')
    return
  }
  shimmer.wrap(proto, 'emit', fn => function (name, err) {
    try {
      if (['close', 'error', 'end'].indexOf(name) >= 0) {
        const span = spans.get(this)
        if (span) {
          if (err) span.events.exit.error = err
          spans.delete(this)
          span.exit()
        }
      } else {
        debugging && ao.clsCheck(`wrapClassEmit.${name}`)
      }
    } catch (e) {
      log.patching('failed to exit zlib.span on %s', name)
    }

    return fn.apply(this, arguments)
  })
}

function wrapConstructor (proto, name) {
  if (typeof proto[name] !== 'function') {
    log.patching('zlib.prototype.%s not a function', name)
    return
  }
  shimmer.wrap(proto, name, Real => {
    function WrappedZlib (options) {
      try {
        const last = Span.last
        if (last && conf.enabled && !spans.get(this)) {
          const span = descend(name, options)(last)
          spans.set(this, span)
          span.async = true
          span.enter()
        }
      } catch (e) {
        log.patching('failed to enter zlib span')
      }

      Real.call(this, options)
    }
    inherits(WrappedZlib, Real)
    wrapClassEmit(WrappedZlib.prototype)
    return WrappedZlib
  })
}

function wrapCreator (proto, name) {
  const creator = 'create' + name
  if (typeof proto[creator] !== 'function') {
    log.patching('zlib.prototype.%s not a function', creator)
    return
  }
  if (nodeVersion < 8) {
    proto[creator] = function (options) {
      return new proto[name](options)
    }
  } else {
    // zlib changed in node 8 so that the creator function object
    // is read-only. It is still configurable. This should work for
    // previous versions as well.
    Object.defineProperty(proto, creator, {
      value: function (...args) {
        return new proto[name](...args)
      },
      writable: true,
      configurable: true
    })
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
      return ao.instrument(
        descend(name, args[1]),
        cb => fn.apply(this, args.concat(cb)),
        conf,
        cb
      )
    })
  } else {
    log.patching('zlib.prototype.%s not a function', name)
  }

  const syncMethod = name + 'Sync'
  if (typeof proto[syncMethod] === 'function') {
    shimmer.wrap(proto, syncMethod, fn => function () {
      return ao.instrument(
        descend(syncMethod, arguments[1]),
        () => fn.apply(this, arguments),
        conf
      )
    })
  } else {
    log.patching('zlib.prototype.%s not a function', syncMethod)
  }
}

module.exports = function (zlib) {
  classes.forEach(name => wrapClass(zlib, name))
  methods.forEach(method => wrapMethods(zlib, method))
  return zlib
}
