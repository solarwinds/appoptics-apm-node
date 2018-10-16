'use strict'

const shimmer = require('ximmer')
const ao = require('..')
const conf = ao.probes.crypto

function build (Operation, Iterations, KeyLength, digest) {
  return span => span.descend('crypto', {
    Operation,
    Iterations,
    KeyLength,
    Digest: typeof digest === 'string' ? digest : 'sha1'
  })
}

function patchPBKDF2 (crypto) {
  if (typeof crypto.pbkdf2 === 'function') {
    shimmer.wrap(crypto, 'pbkdf2', fn => function (...args) {
      // Ignore password and salt args
      const [,, iterations, keylen, digest] = args
      const done = args.pop()
      return ao.instrument(
        build('pbkdf2', iterations, keylen, digest),
        done => fn.apply(this, args.concat(done)),
        conf,
        done
      )
    })
  }

  if (typeof crypto.pbkdf2Sync === 'function') {
    shimmer.wrap(crypto, 'pbkdf2Sync', fn => function (...args) {
      const [password, salt, iterations, keylen, digest] = args
      return ao.instrument(
        build('pbkdf2Sync', iterations, keylen, digest),
        () => fn.call(this, password, salt, iterations, keylen, digest),
        conf
      )
    })
  }
}

function patchOperation (proto, op) {
  if (typeof proto[op] !== 'function') return
  shimmer.wrap(proto, op, fn => function (key, buffer) {
    return ao.instrument(
      span => span.descend('crypto', {
        Operation: op
      }),
      fn.bind(this, key, buffer),
      conf
    )
  })
}

function publicPrivateEncryptDecrypt (crypto) {
  const methods = [
    'publicEncrypt',
    'privateEncrypt',
    'publicDecrypt',
    'privateDecrypt'
  ]

  methods.forEach(method => patchOperation(crypto, method))
}

function patchComputeSecret (cls, className) {
  if (typeof cls.computeSecret !== 'function') return
  shimmer.wrap(cls, 'computeSecret', fn => function (otherKey, inEnc, outEnc) {
    return ao.instrument(
      last => last.descend('crypto', {
        Class: className,
        Operation: 'computeSecret'
      }),
      fn.bind(this, otherKey, inEnc, outEnc),
      conf
    )
  })
}

function patchComputeSecretClass (crypto, className) {
  const name = 'create' + className
  if (typeof crypto[name] === 'function') {
    shimmer.wrap(crypto, name, construct => function () {
      const ret = construct.apply(null, arguments)
      patchComputeSecret(ret, className)
      return ret
    })
  }
}

module.exports = function (crypto) {
  patchComputeSecretClass(crypto, 'ECDH')
  patchComputeSecretClass(crypto, 'DiffieHellman')
  publicPrivateEncryptDecrypt(crypto)
  patchPBKDF2(crypto)
  return crypto
}
