'use strict'

const ao = require('..');
const requirePatch = require('../require-patch');

const logMissing = ao.makeLogMissing('aws-sdk');

//
// this isn't technically speaking a probe. it patches the aws signer sdk so
// that a retransmission, which results in us attaching a new version of the
// x-trace header, isn't part of the signature.
//
module.exports = function (awsSdk) {
  if (!ao.probes['aws-sdk'].enabled) {
    return awsSdk;
  }
  const signerV4 = requirePatch.relativeRequire('aws-sdk/lib/signers/v4');

  if (!signerV4 || !signerV4.prototype || !Array.isArray(signerV4.prototype.unsignableHeaders)) {
    logMissing('v4 unsignableHeaders');
  } else {
    signerV4.prototype.unsignableHeaders.push('x-trace');
  }
  return awsSdk;
}
