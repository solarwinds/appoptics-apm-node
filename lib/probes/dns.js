'use strict'

const shimmer = require('shimmer')
const ao = require('..')
const conf = ao.probes.dns
const log = ao.loggers

function patchSyncMethod (dns, method) {
  if (typeof dns[method] === 'function') {
    shimmer.wrap(dns, method, fn => function (...args) {
      return ao.instrument(
        () => {
          const kvpairs = {
            Spec: 'dns',
            Operation: method,
            Args: JSON.stringify(args[0]) || ''
          }

          return {
            name: 'dns',
            kvpairs
          }
        },
        () => fn.apply(this, args),
        conf
      )
    })
  } else {
    log.patching('dns.%s not a function', method)
  }
}

function patchSyncMethods (dns) {
  const methods = [
    'getServers',
    'setDefaultResultOrder',
    'setServers'
  ]

  methods.forEach(method => patchSyncMethod(dns, method))
}

function patchAsyncCallbackMethod (dns, method) {
  if (typeof dns[method] === 'function') {
    shimmer.wrap(dns, method, fn => function (...args) {
      const cb = args.pop()
      return ao.instrument(
        () => {
          const kvpairs = {
            Spec: 'dns',
            Operation: method,
            Flavor: 'callback',
            Args: args[0] || ''
          }

          return {
            name: 'dns',
            kvpairs
          }
        },
        cb => fn.apply(this, args.concat(cb)),
        conf,
        cb
      )
    })
  } else {
    log.patching('dns.%s not a function', method)
  }
}

function patchAsyncCallbackMethods (dns) {
  const methods = [
    'lookup',
    'lookupService',
    'reverse',
    'resolve',
    'resolve6',
    'resolve4',
    'resolveAny',
    'resolveCaa',
    'resolveCname',
    'resolveMx',
    'resolveNaptr',
    'resolveNs',
    'resolvePtr',
    'resolveSoa',
    'resolveSrv',
    'resolveTxt'
  ]

  methods.forEach(method => patchAsyncCallbackMethod(dns, method))
}

function patchAsyncPromiseMethod (dns, method) {
  if (typeof dns[method] === 'function') {
    shimmer.wrap(dns, method, fn => function (...args) {
      return ao.pInstrument(
        () => {
          const kvpairs = {
            Spec: 'dns',
            Flavor: 'promise',
            Operation: method,
            Args: args[0] || ''
          }

          return {
            name: 'dns',
            kvpairs
          }
        },
        () => fn.apply(this, args),
        conf
      )
    })
  } else {
    log.patching('dns.%s not a function', method)
  }
}

function patchAsyncPromiseMethods (dns) {
  const methods = [
    'lookup',
    'lookupService',
    'reverse',
    'resolve',
    'resolve6',
    'resolve4',
    'resolveAny',
    'resolveCaa',
    'resolveCname',
    'resolveMx',
    'resolveNaptr',
    'resolveNs',
    'resolvePtr',
    'resolveSoa',
    'resolveSrv',
    'resolveTxt'
  ]

  methods.forEach(method => patchAsyncPromiseMethod(dns, method))
}

// instrumentation based on https://nodejs.org/api/dns.html

module.exports = function (dns, options) {
  patchAsyncCallbackMethods(dns)
  patchAsyncPromiseMethods(dns.promises)
  patchSyncMethods(dns)
  return dns
}
