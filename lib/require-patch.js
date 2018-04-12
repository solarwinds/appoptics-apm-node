'use strict'

const debug = require('debug')('appoptics:require-patch')
const WeakMap = require('es6-weak-map')
const Module = require('module')
const glob = require('glob')
const path = require('path')

const realRequire = module.constructor.prototype.require
const patched = new WeakMap()
let probes = {}

const exports = module.exports = {
  //
  // Set locations of instrumentation wrappers to patch named modules
  //
  register (name, path) {
    probes[name] = path
  },
  deregister (name) {
    delete probes[name]
  },

  //
  // Patch require function to monkey patch probes onto modules at load-time
  //
  enable () {
    module.constructor.prototype.require = patchedRequire
  },
  disable () {
    module.constructor.prototype.require = realRequire
  }
}

function patchedRequire (name) {
  let module = realRequire.call(this, name)

  // Only apply probes on first run
  if (module && probes.hasOwnProperty(name) && !patched.get(module)) {
    // Set relative require helper to point to the module being patched
    exports.relativeRequire = this.require.bind(this)

    // Patch
    const path = Module._resolveFilename(name, this)
    module = realRequire(probes[name])(module)

    // Mark as patched
    patched.set(module, true)

    // Replace cached version
    if (require.cache[path]) {
      require.cache[path].exports = module
    }

    debug(`patched ${name}`)
  }

  return module
}


//
// Build a list of all modules we have probes for
//
try {
  probes = glob.sync('**/*.js', {
    cwd: path.join(__dirname, 'probes')
  })
} catch (e) {}

probes.forEach(file => {
  const m = file.match(/^(.*)+\.js$/)
  if (m && m.length == 2) {
    const name = m[1]
    exports.register(name, path.join(__dirname, 'probes', name))
    debug(`found ${name} probe`)
  }
})
