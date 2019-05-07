'use strict'

const ao = require('..');
const requirePatch = require('../require-patch');

const logMissing = ao.makeLogMissing('aws-sdk');

module.exports = function (awsSdk) {
  const signerV4 = requirePatch.relativeRequire('aws-sdk/lib/signers/v4');

  if (!signerV4 || !signerV4.prototype || !Array.isArray(signerV4.prototype.unsignableHeaders)) {
    logMissing('v4 unsignableHeaders');
  } else {
    signerV4.prototype.unsignableHeaders.push('x-trace');
  }
  return awsSdk;
}
