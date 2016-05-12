'use strict'

const tv = require('..')
const conf = tv['raw-body']

function handleExit (layer, done) {
  return function (err, buf) {
    try {
      if (layer && buf && buf.length) {
        layer.events.exit.RequestBodyBytes = buf.length
      }
    } catch (e) {}
    return done.apply(this, arguments)
  }
}

module.exports = function (fn) {
  return function (...args) {
    const last = args[args.length - 1]
    const cb = typeof last === 'function' ? args.pop() : null

    let layer
    const thunk = done => tv.instrument(
      last => (layer = last.descend('body-parser')),
      done => fn.apply(null, args.concat(handleExit(layer, done))),
      conf,
      done
    )

    return cb ? thunk(cb) : thunk
  }
}
