'use strict'

const semver = require('semver')
const pkg = require('hapi/package.json')

if (semver.gte(pkg.version, '17.0.0')) {
  require('./hapi/hapi-17-and-above')
} else {
  require('./hapi/hapi-16-and-below')
}
