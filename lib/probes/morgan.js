'use strict'

const ao = require('..')
const shimmer = require('shimmer')

const logMissing = ao.makeLogMissing('morgan')

module.exports = function (morgan, info) {
  if (!ao.probes.morgan.enabled) {
    return morgan
  }

  // insertion into predefined formats is done by adding a token to the predefined format string
  // user can also use token in their own formats
  const autoToken = ':trace'

  // morgan tokens are functions
  // define a token function at load time
  morgan.token(autoToken.slice(1), () => ao.getTraceStringForLog())

  // do format modification
  const predefineds = ['combined', 'common', 'short', 'tiny']
  predefineds.forEach(predefined => {
    morgan.format(predefined, `${morgan[predefined]} ${autoToken}`)
  })

  if (typeof morgan.dev === 'function') {
    // the dev predefined format is a compiled function. thus there is no access to the format string
    // wrap it to modify function result
    shimmer.wrap(morgan, 'dev', function (original) {
      return function wrappedDev (tokens, req, res) {
        const str = original.apply(this, arguments)

        return `${str} ${ao.getTraceStringForLog()}`
      }
    })
  } else {
    logMissing('dev')
  }

  return morgan
}
