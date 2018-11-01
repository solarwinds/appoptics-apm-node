'use strict'

const shimmer = require('ximmer')
const ao = require('..')

module.exports = function (bcrypt) {
  const methods = [ 'compare', 'genSalt', 'hash' ]
  methods.forEach(method => {
    shimmer.wrap(bcrypt, method, fn => function (...args) {
      if (args.length) {
        args.push(ao.bind(args.pop()))
      }
      return fn.apply(this, args)
    })
  })
  return bcrypt
}
