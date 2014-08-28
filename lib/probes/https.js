var httpPatch = require('./http')

module.exports = function (module, proto) {
  return httpPatch(module, 'https')
}
