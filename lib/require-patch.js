var debug = require('debug')('node-oboe:require-patch')
var fs = require('fs')

var slice = Array.prototype.slice

//
// Build a list of all modules we have probes for
//
var probes = {}
var loaded = {}

fs.readdirSync(__dirname + '/probes').forEach(function (file) {
  var m = file.match(/^(.*)+\.js$/)
  if (m && m.length == 2) {
    probes[m[1]] = true
    debug('found ' + m[1] + ' probe')
  }
})

// Temporarily disable some probes
delete probes.express
delete probes.redis

//
// Patch require function to monkey patch probes onto modules at load-time
//
var realRequire = module.__proto__.require

exports.enable = function () {
  module.__proto__.require = function (name) {
    var module = realRequire.call(this, name)

    // Only apply probes on first run
    if (module && probes[name] && !loaded[name]) {
      loaded[name] = true
      module = realRequire(__dirname + '/probes/' + name)(module)
      debug('patched ' + name)
    }

    return module
  }
}

exports.disable = function () {
  module.__proto__.require = realRequire
}

exports.enable()
