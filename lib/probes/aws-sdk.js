'use strict'

const shimmer = require('ximmer');
const ao = require('..');
const requirePatch = require('../require-patch');

const logMissing = ao.makeLogMissing('aws-sdk');

//function patchHandleRequest (proto) {
//
//  shimmer.wrap(proto, 'handleRequest', fn => {
//    return function wrappedHandleRequest (httpRequest) {
//      if (httpRequest) {
//        if (!httpRequest.headers) {
//          httpRequest.headers = Object.create(null);
//        }
//        httpRequest.headers[ao.omitTraceId] = true;
//      } else {
//        logMissing('httpRequest argument');
//      }
//
//      return fn.apply(this, arguments);
//    }
//  })
//}
//
//module.exports = function (awsSdk) {
//  if (typeof awsSdk.NodeHttpClient !== 'function') {
//    logMissing('NodeHttpClient()');
//  } else if (typeof awsSdk.NodeHttpClient.prototype.handleRequest !== 'function') {
//    logMissing('NodeHttpClient.prototype.handleRequest()');
//  } else {
//    patchHandleRequest(awsSdk.NodeHttpClient.prototype);
//  }
//  return awsSdk;
//}

module.exports = function (awsSdk) {
  const signerV4 = requirePatch.relativeRequire('aws-sdk/lib/signers/v4');

  if (!signerV4 || !signerV4.prototype || !Array.isArray(signerV4.prototype.unsignableHeaders)) {
    logMissing('v4 unsignableHeaders');
  } else {
    signerV4.prototype.unsignableHeaders.push('x-trace');
  }
  return awsSdk;
}
