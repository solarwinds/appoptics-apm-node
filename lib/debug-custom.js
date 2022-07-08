/*
MIT License

Copyright (c) 2019-2022 Bruce A. MacNaughton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * A simple class built on top of the debug package that enables using a custom
 * environment variable and avoids having to specify prefixes for each log level.
 */

class Logger {
  constructor (name, opts = {}) {
    this.name = name // the name of the environment variable storing the settings
    this.prefix = name + ':' // the prefix used when setting debug's DEBUG env var
    let internal = [] // settings prefixed with `${name}:`
    const external = [] // settings other than `${name}:` prefixed
    this.current = [] // an array of non-prefixed current settings for name
    const envName = opts.envName || name

    const env = process.env

    this.originalExternal = env.DEBUG

    // if there are DEBUG settings sort them into internal (prefixed with name)
    // and external.
    if (env.DEBUG) {
      const debugSettings = splitAndTrim(env.DEBUG)
      debugSettings.forEach(s => {
        if (s.startsWith(this.prefix)) {
          internal.push(s.slice(this.prefix.length))
        } else {
          external.push(s)
        }
      })
      // remove internal settings but put external settings back; internal
      // settings will be added later but they might be different if 'name'
      // is defined.
      env.DEBUG = external.join(',')
    }
    // if set this take precedence over DEBUG so replace any internal already found.
    if (envName in env) {
      internal = splitAndTrim(env[envName])
    }

    // now it's ok to get debug because things are set up to drop into the normal flow
    this.debug = require('debug')

    // when setting find external settings, add the requested new settings, and replace
    // all settings. this removes the previous internal settings implicitly.
    Object.defineProperty(this, 'logLevel', {
      get () { return this.current.join(',') },
      set (value) {
        if (typeof value === 'string') {
          value = splitAndTrim(value)
        }
        if (Array.isArray(value)) {
          let external = []
          if (env.DEBUG) {
            external = splitAndTrim(env.DEBUG).filter(s => s && !s.startsWith(this.prefix))
          }
          // remember our current settings after removing empties
          this.current = [...new Set(value)].filter(s => s.trim())
          this.debug.enable(this.current.map(s => this.prefix + s).concat(external).join(','))
        }
      }
    })

    // now that there is a setter use it.
    this.logLevel = 'defaultLevels' in opts ? opts.defaultLevels : ['error', 'warn']

    // if there were previous settings add them too
    if (internal.length) {
      this.addEnabled(internal)
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
    if (typeof levels === 'string') {
      levels = splitAndTrim(levels)
    }

    if (!Array.isArray(levels)) {
      return undefined
    }

    // make an array of levels not in the current set
    this.logLevel = this.current.concat(levels.filter(s => this.current.indexOf(s) < 0))

    return this.logLevel
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
    if (typeof levels === 'string') {
      levels = splitAndTrim(levels)
    }

    if (!Array.isArray(levels)) {
      return undefined
    }

    // don't try to remove those that aren't present.
    this.logLevel = this.current.filter(s => levels.indexOf(s) < 0)

    return this.current.join(',')
  }

  has (level) {
    return this.current.indexOf(level) >= 0
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

function splitAndTrim (s) {
  return s.split(/[\s,]+/).filter(s => s)
}

module.exports = Logger
