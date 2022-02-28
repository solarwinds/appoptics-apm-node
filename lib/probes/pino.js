'use strict'

const ao = require('..')

const shimmer = require('shimmer')
const semver = require('semver')

const logMissing = ao.makeLogMissing('pino')

function patchWrite (write) {
  return function writeWithLogObject (obj, msg, num) {
    arguments[0] = obj = obj || {}
    ao.insertLogObject(obj)
    return write.apply(this, arguments)
  }
}

module.exports = function (pino, info) {
  if (!ao.probes.pino.enabled) {
    return pino
  }

  // pino is a an anonymous function from which logger instance objects are created.
  // user will require pino then invoke it by calling pino().
  // wrap the pino function so that when invoked
  // it will wrap an internal write function of the returned logger object.

  // sequence through the versions, starting at the highest.

  // for all versions above 5 wrap pino's instantiation function
  if (semver.gte(info.version, '5.0.0')) {
    // shimmer only works with named methods of an object.
    // thus create an object that shimmer can work with
    const mock = { pino }

    shimmer.wrap(mock, 'pino', function (original) {
      // define a function that wraps a method on the logger instance
      // and returns the instance with the wrapped function
      const fn = function () {
        const instance = original.apply(this, arguments)
        const symbol = original.symbols.writeSym

        Object.defineProperty(instance, symbol, {
          configurable: true,
          enumerable: true,
          writable: true,
          // wrap the internal write method
          value: shimmer.wrap(instance, original.symbols.writeSym, patchWrite)
        })

        return instance
      }

      // augment the wrapped function with the original properties
      Object.setPrototypeOf(fn, original)

      const props = Object.getOwnPropertyDescriptors(original)
      const keys = Reflect.ownKeys(props)

      for (const key of keys) {
        Object.defineProperty(fn, key, props[key])
      }

      // return the pino function
      return fn
    })

    // set pino as the anonymous wrapped function
    pino = mock.pino

  // version 4 was locked down tight requiring this ugly solution
  } else if (semver.gte(info.version, '4.0.0')) {
    const loggerProxy = {
      get (logger, prop) {
        if (prop !== 'write') {
          return Reflect.get(...arguments)
        }
        return patchWrite(Reflect.get(...arguments))
      }
    }
    const pinoProxy = {
      // handle calls to pino
      apply (pino, self, args) {
        const logger = pino.apply(self, ...args)

        // proxy the logger so we can intercept write calls.
        return new Proxy(logger, loggerProxy)
      }
    }
    pino = new Proxy(pino, pinoProxy)

  // versions 3 and 2 are just a bit different
  } else if (semver.gte(info.version, '2.0.0')) {
    const proto = Object.getPrototypeOf(pino())
    if (typeof proto.asJson === 'function') {
      shimmer.wrap(proto, 'asJson', patchWrite)
    } else {
      logMissing('prototype.asJson()')
    }
  }

  return pino
}
