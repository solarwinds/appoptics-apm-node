'use strict'

const httpPatch = require('./http')

module.exports = function (module, options) {
  return httpPatch(module, options, 'https')
}
