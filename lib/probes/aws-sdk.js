'use strict'

const shimmer = require('ximmer')
const ao = require('..')

const logMissing = ao.makeLogMissing('aws-sdk');

function patchHandleRequest (proto) {

  shimmer.wrap(proto, 'handleRequest', fn => {
    return function wrappedHandleRequest (httpRequest) {
      if (httpRequest) {
        if (!httpRequest.headers) {
          httpRequest.headers = Object.create(null);
        }
        httpRequest.headers[ao.omitTraceId] = true;
      } else {
        logMissing('httpRequest argument');
      }

      return fn.apply(this, arguments);
    }
  })
}

module.exports = function (awsSdk) {
  if (typeof awsSdk.NodeHttpClient !== 'function') {
    logMissing('NodeHttpClient()');
  } else if (typeof awsSdk.NodeHttpClient.prototype.handleRequest !== 'function') {
    logMissing('NodeHttpClient.prototype.handleRequest()');
  } else {
    patchHandleRequest(awsSdk.NodeHttpClient.prototype);
  }
  return awsSdk;
}
