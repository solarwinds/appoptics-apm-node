'use strict'

const semver = require('semver')
const pkg = require('pg/package.json')

if (semver.lt(pkg.version, '7.0.0')) {
  require('./pg6-minus')
} else {
  require('./pg6-plus')
}
