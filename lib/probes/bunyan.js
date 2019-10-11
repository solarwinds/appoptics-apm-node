'use strict';

const ao = require('..');

const requirePatch = require('../require-patch');
const shimmer = require('ximmer');
const semver = require('semver');

const logMissing = ao.makeLogMissing('bunyan');

function patchEmit (_emit) {
  return function emitWithLogObject (rec, noemit) {
    ao.insertLogObject(rec);
    return _emit.apply(this, arguments);
  }
}

module.exports = function (bunyan) {
  if (!ao.probes.bunyan.enabled) {
    return bunyan;
  }

  requirePatch.disable();
  let pkg;
  try {
    pkg = requirePatch.relativeRequire('bunyan/package.json');
  } catch (e) {
    pkg = {version: '0.0.0'};
    logMissing('prerequisites', e);
  }
  requirePatch.enable();

  if (semver.gte(pkg.version, '1.0.0')) {
    if (typeof bunyan.prototype._emit === 'function') {
      shimmer.wrap(bunyan.prototype, '_emit', patchEmit);
    } else {
      logMissing('prototype._emit()');
    }
  }
  return bunyan;
}
