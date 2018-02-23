'use strict'

const debug = require('debug')
const tty = require('tty')
const util = require('util')
require('./log-formatters')

let isatty = tty.isatty(process.stdout.fd || tty.isatty(process.stderr.fd))

if (!isatty) {
  var logbuf = Buffer.alloc(1000000, 0, 'utf8')
  var bufpos = 0

  // tell debug to use this function, not the default console function
  debug.log = function (...args) {
    args.forEach(arg => {
      if (arg === undefined) return
      let text = arg.toString() + '\n'
      bufpos += logbuf.write(text, bufpos)

    })
  }

  exports._buffer = {
    getString: function () {
      return logbuf.toString('utf8', 0, bufpos)
    },
    clear: function () {
      bufpos = 0
    },
    write: function (text) {
      if (!text) return
      bufpos += logbuf.write(text + '\n', bufpos)
    },
    status: function () {
      return {count: bufpos, buffer: logbuf}
    },
    getPosition: function () {
      return bufpos
    },
    setPosition: function (position) {
      bufpos = position
    }
  }
} else {
  exports._buffer = {
    getString: function () {},
    clear: function () {},
    write: function () {},
    status: function () {return {}},
    getPosition: function () {return 0},
    setPosition: function () {}
  }
}

var enabled = true

Object.defineProperty(exports, 'enabled', {
  get () {return enabled},
  set (value) {
    enabled = !!value
  }
})

exports.force = {
  flow: debug('appoptics:flow'),
  state: debug('appoptics:state'),
  oboe: debug('appoptics:oboe'),
  metadata: debug('appoptics:metadata'),
  layer: debug('appoptics:layer'),
  info: debug('appoptics:info'),
  status: debug('appoptics:status'),
  settings: debug('appoptics:settings')
}
//
// Expose the forced loggers at the top level where they are wrapped so
// the global enable must be true for them to be output.
//
var wrap = function (fn) {return function () {enabled && fn.apply(fn, arguments)}}

Object.keys(exports.force).forEach(function (key) {
  exports[key] = wrap(exports.force[key])
})

//
// always log errors and info when set, no need to force
//
exports.error = debug('appoptics:error')        // used for unexpected errors
exports.force.error = exports.error
exports.warn = debug('appoptics:warn')          // warning level
exports.force.warn = exports.warn
exports.debug = debug('appoptics:debug')        // no need to force.
exports.force.debug = exports.debug

//
// always log, even if no 'appoptics:' settings at all.
//
var always = function () {console.log('appoptics:always', ...arguments)}
exports.always = always                               // log whether enabled or not (using console.log)
var ifNotTTY = function () {!isatty && console.log(...arguments)}
exports.ifNotTTY = ifNotTTY


exports.test = {
  info: wrap(debug('appoptics:test:info')),
  mock: wrap(debug('appoptics:test:mock-port')),
  message: wrap(debug('appoptics:test:message'))
}
