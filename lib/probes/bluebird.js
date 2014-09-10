var tv = require('..')

module.exports = function (bluebird) {
  require('cls-bluebird')(tv.requestStore)
  return bluebird
}
