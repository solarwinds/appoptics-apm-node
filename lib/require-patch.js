var debug = require('debug')('traceview:require-patch')
var fs = require('fs')

var realRequire = module.__proto__.require
var slice = Array.prototype.slice
var probes = {}

//
// Set locations of instrumentation wrappers to patch named modules
//
exports.register = function (name, path) {
  probes[name] = path
}

exports.deregister = function (name) {
  delete probes[name]
}

//
// Build a list of all modules we have probes for
//
fs.readdirSync(__dirname + '/probes').forEach(function (file) {
  var m = file.match(/^(.*)+\.js$/)
  if (m && m.length == 2) {
    var name = m[1]
    exports.register(name, __dirname + '/probes/' + name)
    debug('found ' + name + ' probe')
  }
})

// Temporarily disable some probes
// delete probes.express

//
// Patch require function to monkey patch probes onto modules at load-time
//
exports.enable = function () {
  module.__proto__.require = function (name) {
    var module = realRequire.call(this, name)

    // Only apply probes on first run
    if (module && probes.hasOwnProperty(name) && !module._patchedByTraceView) {
      Object.defineProperty(module, '_patchedByTraceView', {
        value: true
      })
      module = realRequire(probes[name])(module)
      debug('patched ' + name)
    }

    return module
  }
}

exports.disable = function () {
  module.__proto__.require = realRequire
}
