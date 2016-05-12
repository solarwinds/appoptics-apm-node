'use strict'

const httpPatch = require('./http')

module.exports = function (module) {
  return httpPatch(module, 'https')
}
