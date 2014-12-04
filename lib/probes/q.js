var requirePatch = require('../require-patch')
var tv = require('..')

module.exports = function (q) {
  requirePatch.disable()
  require('cls-q')(tv.requestStore)
  requirePatch.enable()
  return q
}
