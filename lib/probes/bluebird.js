var requirePatch = require('../require-patch')
var tv = require('..')

module.exports = function (bluebird) {
  requirePatch.disable()
  require('cls-bluebird')(tv.requestStore)
  requirePatch.enable()
  return bluebird
}
