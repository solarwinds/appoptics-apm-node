var shimmer = require('shimmer')
var slice = require('sliced')
var tv = require('..')

module.exports = function (bcrypt) {
  var methods = [
    'compare',
    'genSalt',
    'hash'
  ]

  methods.forEach(function (method) {
    shimmer.wrap(bcrypt, method, patchCallback)
  })

  return bcrypt
}

function patchCallback (fn) {
  return function () {
    var args = slice(arguments)
    if (tv.tracing) {
      args.push(tv.requestStore.bind(args.pop()))
    }
    return fn.apply(this, args)
  }
}
