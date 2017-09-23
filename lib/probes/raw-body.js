'use strict'

const requirePatch = require('../require-patch')
const semver = require('semver')
const ao = require('..')
const conf = ao['raw-body']

function addBytes (layer, buf) {
  try {
    if (layer && buf && buf.length) {
      layer.events.exit.RequestBodyBytes = buf.length
    }
  } catch (e) {}
}

function handleExit (layer, done) {
  return function (err, buf) {
    addBytes(layer, buf)
    return done.apply(this, arguments)
  }
}

function promiser (fn) {
  return function (...args) {
    const last = args[args.length - 1]
    const cb = typeof last === 'function' ? args.pop() : function () {}

    let layer
    return ao.instrument(
      last => (layer = last.descend('body-parser')),
      done => fn.apply(null, args).then(v => {
        addBytes(layer, v)
        done(null, v)
        return v
      }, done),
      conf,
      cb
    )
  }
}

function thunker (fn) {
  return function (...args) {
    const last = args[args.length - 1]
    const cb = typeof last === 'function' ? args.pop() : null

    let layer
    const thunk = done => ao.instrument(
      last => (layer = last.descend('body-parser')),
      done => fn.apply(null, args.concat(handleExit(layer, done))),
      conf,
      done
    )

    return cb ? thunk(cb) : thunk
  }
}

module.exports = function (fn) {
  try {
    const {version} = requirePatch.relativeRequire('raw-body/package.json')
    return semver.satisfies(version, '< 2') ? thunker(fn) : promiser(fn)
  } catch (e) {
    return fn
  }
}
