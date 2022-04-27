'use strict'

const Module = require('module')
const path = require('path')
const ao = require('./index')

const realRequire = module.constructor.prototype.require
const patched = new WeakMap()
const probes = {}

// abstracted probes are those known by another name, e.g. `amqplib/callback_api` is just a wrapper around
// the `amqplib` probe where the configuration is done.
const abstractedProbes = [
  'amqplib/callback_api'
]

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

  let pkg = { version: '' }

  // if no module, or no probe for the module, or it's already patched then there isn't
  // anything to do.
  if (!mod || !Object.prototype.hasOwnProperty.call(probes, name) || patched.get(mod)) {
    return mod
  }

  // Set relative require helper to point to the module being patched
  exports.relReq = exports.relativeRequire = this.require.bind(this)
  exports.inertRelReq = function (file) {
    exports.disable()
    exports.relativeRequire(file)
    exports.enable()
  }

  // don't try to read package.json if it's a built-in module.
  if (Module.builtinModules.indexOf(name) === -1) {
    try {
      // call is NOT useless
      pkg = this.require.call(this, `${name}/package.json`) // eslint-disable-line no-useless-call
    } catch (e) {
      // nothing to do.
    }
  }
  const options = { name, version: pkg.version }

  // patch the module that was required above. 'name' is passed so
  // multiple modules can share the same probe code.
  //
  // N.B. the amqplib/callback_api probe makes the second argument
  // an options object. if more information is needed by a probe
  // at some point, e.g., {name, newInfo: ...} then the second argument
  // here should become an options object and amqplib/callback_api will
  // need to be modified in addition to the @hapi probes.
  const path = Module._resolveFilename(name, this)

  // require the probe with the real module as the first argument.
  mod = realRequire(probes[name])(mod, options)

  // allow patchers to return the version patched for logging. in order to
  // return the version they should return [patched-module, version-info-string].
  let v = pkg.version
  if (Array.isArray(mod)) {
    v = mod[1]
    mod = mod[0]
  }

  // Mark as patched
  patched.set(mod, true)

  // Replace cached version
  if (require.cache[path]) {
    require.cache[path].exports = mod
  }

  ao.loggers.patching(`patched ${name} ${v}`)

  return mod
}

const probeList = require('./probe-defaults')

Object.keys(probeList).forEach(name => {
  exports.register(name, path.join(__dirname, 'probes', name))
  ao.loggers.probes(`found ${name} probe`)
})

abstractedProbes.forEach(name => {
  exports.register(name, path.join(__dirname, 'probes', name))
  ao.loggers.probes(`found ${name} probe`)
})
