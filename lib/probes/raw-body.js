'use strict'

const requirePatch = require('../require-patch')
const semver = require('semver')
const ao = require('..')
const conf = ao.probes['raw-body']

function addBytes (span, buf) {
  try {
    if (span && buf && buf.length) {
      span.events.exit.RequestBodyBytes = buf.length
    }
  } catch (e) {}
}

function handleExit (span, done) {
  return function (err, buf) {
    addBytes(span, buf)
    return done.apply(this, arguments)
  }
}

function promiser (fn) {
  return function (...args) {
    const last = args[args.length - 1]
    const cb = typeof last === 'function' ? args.pop() : function () {}

    let span
    return ao.instrument(
      last => (span = last.descend('body-parser')),
      done => fn.apply(null, args).then(v => {
        addBytes(span, v)
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

    let span
    const thunk = done => ao.instrument(
      last => (span = last.descend('body-parser')),
      done => fn.apply(null, args.concat(handleExit(span, done))),
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
