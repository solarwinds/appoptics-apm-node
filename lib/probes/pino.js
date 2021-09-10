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

  // sequence through the versions, starting at the highest.
  // version 5 recognized that packages like this need to access internals
  if (semver.gte(info.version, '5.0.0')) {
    const proto = Object.getPrototypeOf(pino())
    if (typeof proto[pino.symbols.writeSym] === 'function') {
      shimmer.wrap(proto, pino.symbols.writeSym, patchWrite)
    } else {
      logMissing('prototype.write()')
    }

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
