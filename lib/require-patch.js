'use strict'

const Module = require('module')
const glob = require('glob')
const path = require('path')
const ao = require('./index')

const realRequire = module.constructor.prototype.require
const patched = new WeakMap()
const probes = {}

exports = module.exports = {
  //
  // Set locations of instrumentation wrappers to patch named modules
  //
  register (name, path) {
    probes[name] = path;
    // supply a skeletal config if none is present.
    if (!ao.probes[name]) {
      ao.probes[name] = {enabled: true};
    }
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

// allow scoped packages to use same tests as unscoped versions. this
// facilitates testing without duplicating for supported packages that
// change to scoped.
const nameToPatchFile = {
  hapi: '@hapi/hapi',
  vision: '@hapi/vision'
}

function patchedRequire (name) {
  let mod = realRequire.call(this, name)

  // Only apply probes on first run
  if (mod && probes.hasOwnProperty(name) && !patched.get(mod)) {
    // Set relative require helper to point to the module being patched
    exports.relativeRequire = this.require.bind(this);

    // patch the module that was required above. 'name' is passed so
    // that @hapi/hapi and hapi (as well as @hapi/vision and vision)
    // can share the same probe code.
    // N.B. the amqplib/callback_api probe makes the second argument
    // an options object. if more information is needed by a probe
    // at some point, e.g., {name, newInfo: ...} then the second argument
    // here should become an options object and amqplib/callback_api will
    // need to be modified in addition to the @hapi probes.
    const path = Module._resolveFilename(name, this);
    mod = realRequire(probes[name])(mod, name);

    // allow patchers to return the patched version for display.
    let v;
    if (Array.isArray(mod)) {
      v = mod[1];
      mod = mod[0];
    }

    // Mark as patched
    patched.set(mod, true)

    // Replace cached version
    if (require.cache[path]) {
      require.cache[path].exports = mod
    }

    ao.loggers.patching(`patched ${name} ${v ? v : ''}`)
  }

  return mod
}


//
// Build a list of all modules we have probes for
//
let probeFiles;
try {
  probeFiles = glob.sync('**/*.js', {
    cwd: path.join(__dirname, 'probes')
  })
} catch (e) {
  ao.loggers.error('failed to load probe map', e.message);
}

probeFiles.forEach(file => {
  const m = file.match(/^(.*)+\.js$/)
  if (m && m.length == 2) {
    const name = m[1]
    exports.register(name, path.join(__dirname, 'probes', name))
    ao.loggers.probes(`found ${name} probe`)
  }
})

Object.keys(nameToPatchFile).forEach(m => {
  // if it's in both places it's an error. ignore the map.
  if (m in probes) {
    ao.loggers.error(`probe ${m} in probe directory and map`);
    return;
  }
  ao.loggers.probes(`mapping ${m} to ${nameToPatchFile[m]}`);
  // point it at the same file as the primary probe name.
  probes[m] = probes[nameToPatchFile[m]];
})
