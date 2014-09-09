var tv = require('..')

module.exports = function (q) {
  require('cls-q')(tv.requestStore)
  return q
}
