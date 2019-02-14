'use strict'

/**
 * A simple class built on top of the debug package that enables using a custom
 * environment variable and avoids having to specify prefixes for each log level.
 */

class Logger {

  constructor (name, opts = {}) {
    this.name = name            // the name of the environment variable storing the settings
    this.prefix = name + ':'    // the prefix used when setting debug's DEBUG env var
    let internal = []           // settings prefixed with `${name}:`
    const external = []         // settings other than `${name}:` prefixed
    this.current = []           // an array of non-prefixed current settings for name

    const env = process.env

    this.originalExternal = env.DEBUG

    // if there are DEBUG settings sort them into internal (prefixed with name)
    // and external.
    if (env.DEBUG) {
      const debugSettings = env.DEBUG.split(',').map(s => s.trim())
      debugSettings.forEach(s => {
        (s.startsWith(name) ? internal : external).push(s)
      })
      // remove internal settings but put external settings back; internal
      // settings will be added later but they might be different if 'name'
      // is defined.
      env.DEBUG = external.join(',')
    }
    // if set this take precedence over DEBUG so replace any internal already found.
    if (name in env) {
      internal = env[name].split(',').map(s => s.trim())
    }

    // now it's ok to get debug because things are set up to drop into the normal flow
    this.debug = require('debug')

    // when setting find external settings, add the requested new settings, and replace
    // all settings. this removes the previous internal settings implicitly.
    Object.defineProperty(this, 'logLevel', {
      get () {return this.current.join(',')},
      set (value) {
        if (typeof value === 'string') {
          value = value.split(',')
        }
        if (Array.isArray(value)) {
          let external = []
          if (env.DEBUG) {
            external = env.DEBUG.split(',').map(s => s.trim()).filter(s => !s.startsWith(this.prefix))
          }
          // remember our current settings
          this.current = value.map(s => s.trim())
          this.debug.enable(this.current.map(s => this.prefix + s).concat(external).join(','))
        }
      }
    })

    // now that there is a setter use it.
    if (internal.length) {
      this.logLevel = internal.map(s => s.slice(this.prefix.length))
    } else {
      this.logLevel = opts.defaultLevels ? opts.defaultLevels : ['error', 'warn']
    }
  }

  /**
   * Add log levels to the existing set of log levels.
   *
   * @method ao.addEnabled
   * @param {string} levels - comma separated list of levels to add
   * @return {string|undefined} - the current log levels or undefined if an error
   *
   * @example
   * ao.addEnabled('warn,debug')
   */
  addEnabled (levels) {
    if (typeof levels !== 'string') {
      throw new TypeError(`addEnabled argument not a string: ${typeof levels}`)
    }
    // make an array of levels not in the current set
    levels = levels.split(',').map(s => s.trim()).filter(s => this.current.indexOf(s) < 0)
    return this.logLevel = this.current.concat(levels)
  }

  /**
   * Remove log levels from the current set.
   *
   * @method ao.removeEnabled
   * @param {string} levels - comma separated list of levels to remove
   * @return {string|undefined} - log levels after removals or undefined if an
   *                              error.
   * @example
   * var previousLogLevel = ao.logLevel
   * ao.addEnabled('debug')
   * ao.removeEnabled(previousLogLevel)
   */
  removeEnabled (levels) {
    if (typeof levels !== 'string') {
      throw new TypeError(`removeEnabled argument not a string: ${typeof levels}`)
    }

    // don't try to remove those that aren't present.
    levels = levels.split(',').map(s => s.trim())
    this.logLevel = this.current.filter(s => levels.indexOf(s) < 0)

    return this.current.join(',')
  }

  /**
   * Make a logger, optionally enabling it.
   */
  make (level, enable) {
    const logger = this.debug(`${this.prefix}${level}`)
    if (enable) {
      this.addEnabled(level)
    }
    return logger
  }

}

module.exports = Logger
