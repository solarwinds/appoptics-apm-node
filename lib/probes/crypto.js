var shimmer = require('shimmer')
var slice = require('sliced')
var tv = require('..')
var Layer = tv.Layer
var Event = tv.Event
var conf = tv.crypto

function patchPBKDF2 (crypto) {
  function build (operation, iterations, keylen, digest) {
    return function (layer) {
      return layer.descend('crypto', {
        Operation: operation,
        Iterations: iterations,
        KeyLength: keylen,
        Digest: typeof digest === 'string' ? digest : 'sha1'
      })
    }
  }

  if (crypto.pbkdf2) {
    shimmer.wrap(crypto, 'pbkdf2', function (fn) {
      return function (password, salt, iterations, keylen, digest, callback) {
        var builder = build('pbkdf2', iterations, keylen, digest)
        var args = slice(arguments)
        var done = args.pop()
        var self = this

        function run (callback) {
          args.push(callback)
          return fn.apply(self, args)
        }

        return tv.instrument(builder, run, conf, done)
      }
    })
  }

  if (crypto.pbkdf2Sync) {
    shimmer.wrap(crypto, 'pbkdf2Sync', function (fn) {
      return function (password, salt, iterations, keylen, digest) {
        var run = fn.bind(this, password, salt, iterations, keylen, digest)
        var builder = build('pbkdf2Sync', iterations, keylen, digest)
        return tv.instrument(builder, run, conf)
      }
    })
  }
}

function publicPrivateEncryptDecrypt (crypto) {
  function makeTraced (op) {
    return function (fn) {
      return function (key, buffer) {
        var run = fn.bind(this, key, buffer)
        return tv.instrument(function (layer) {
          return layer.descend('crypto', {
            Operation: op
          })
        }, run, conf)
      }
    }
  }

  var methods = [
    'publicEncrypt',
    'privateEncrypt',
    'publicDecrypt',
    'privateDecrypt'
  ]

  methods.forEach(function (method) {
    if (crypto[method]) {
      shimmer.wrap(crypto, method, makeTraced(method))
    }
  })
}

function patchComputeSecret (crypto, className) {
  if (crypto['create' + className]) {
    shimmer.wrap(crypto, 'create' + className, function (construct) {
      return function () {
        var args = slice(arguments)
        var ret = construct.apply(null, args)

        shimmer.wrap(ret, 'computeSecret', function (fn) {
          return function (otherPublicKey, inputEncoding, outputEncoding) {
            var run = fn.bind(this, otherPublicKey, inputEncoding, outputEncoding)
            return tv.instrument(function (layer) {
              return layer.descend('crypto', {
                Class: className,
                Operation: 'computeSecret'
              })
            }, run, conf)
          }
        })

        return ret
      }
    })
  }
}

module.exports = function (crypto) {
  patchComputeSecret(crypto, 'ECDH')
  patchComputeSecret(crypto, 'DiffieHellman')
  publicPrivateEncryptDecrypt(crypto)
  patchPBKDF2(crypto)

  return crypto
}
