'use strict'

const logPatched = require('debug')('appoptics:require-patch')
const Module = require('module')
const glob = require('glob')
const path = require('path')

const realRequire = module.constructor.prototype.require
const patched = new WeakMap()
let probes = {}

exports = module.exports = {
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
  let mod = realRequire.call(this, name)

  // Only apply probes on first run
  if (mod && probes.hasOwnProperty(name) && !patched.get(mod)) {
    // Set relative require helper to point to the module being patched
    exports.relativeRequire = this.require.bind(this)

    // Patch
    const path = Module._resolveFilename(name, this)
    mod = realRequire(probes[name])(mod)

    // Mark as patched
    patched.set(mod, true)

    // Replace cached version
    if (require.cache[path]) {
      require.cache[path].exports = mod
    }

    logPatched(`patched ${name}`)
  }

  return mod
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
    logPatched(`found ${name} probe`)
  }
})
