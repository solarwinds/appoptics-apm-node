'use strict';

const ao = require('..');

const requirePatch = require('../require-patch');
const shimmer = require('ximmer');
const semver = require('semver');

const logMissing = ao.makeLogMissing('pino');



function patchWrite (write) {
  return function writeWithLogObject (obj, msg, num) {
    arguments[0] = obj = obj || {};
    ao.insertLogObject(obj);
    return write.apply(this, arguments);
  }
}

function patchGenLog (genLog) {
  return function genLogWithLogObject (z) {
    const log = genLog(z)

    return function logWithLogObject (...args) {
      if (!args[0]) {
        args[0] = {};
      } else if (typeof args[0] !== 'object') {
        args.unshift({});
      }

      ao.insertLogObject(args[0]);
      return log.apply(this, args);
    }
  }
}

module.exports = function (pino) {

  requirePatch.disable();
  let pkg;
  try {
    pkg = requirePatch.relativeRequire('pino/package.json');
  } catch (e) {
    pkg = {version: '0.0.0'};
    logMissing('prerequisites', e);
  }
  requirePatch.enable();

  // sequence through the versions, starting at the highest.
  // version 5 recognized that packages like this need to access internals
  if (semver.gte(pkg.version, '5.0.0')) {
    const proto = Object.getPrototypeOf(pino());
    if (typeof proto[pino.symbols.writeSym] === 'function') {
      shimmer.wrap(proto, pino.symbols.writeSym, patchWrite);
    } else {
      logMissing('prototype.write()');
    }

  // version 4 was locked down tight requiring this ugly solution
  } else if (semver.gte(pkg.version, '4.0.0')) {
    const loggerProxy = {
      get (logger, prop) {
        if (prop !== 'write') {
          return Reflect.get(...arguments);
        }
        return patchWrite(Reflect.get(...arguments));
      }
    }
    const pinoProxy = {
      // handle calls to pino
      apply (pino, self, args) {
        const logger = pino.apply(self, ...args);

        // proxy the logger so we can intercept write calls.
        return new Proxy(logger, loggerProxy);
      }
    };
    pino = new Proxy(pino, pinoProxy);

  // versions 3 and 2 are just a bit different
  } else if (semver.gte(pkg.version, '2.0.0')) {
    const proto = Object.getPrototypeOf(pino());
    if (typeof proto.asJson === 'function') {
      shimmer.wrap(proto, 'asJson', patchWrite);
    } else {
      logMissing('prototype.asJson()');
    }
  }

  return pino;
}
