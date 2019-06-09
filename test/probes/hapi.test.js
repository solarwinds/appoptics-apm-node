'use strict'

const semver = require('semver')
const pkg = require('hapi/package.json')

// if the @hapi test ran first clear the environment variable so this
// test won't load @hapi.
delete process.env.hapiVersion

// this test is split into two separate files so that one can use async/await syntax.
// the javascript parser will flag syntax errors if it encounters async/await prior to
// versions that support it.

if (semver.gte(pkg.version, '17.0.0')) {
  require('./hapi/hapi-17-and-above')
} else {
  require('./hapi/hapi-16-and-below')
}
