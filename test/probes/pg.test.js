'use strict'

const semver = require('semver')
const pkg = require('pg/package.json')

//
// so why are the files called pg6-minus and pg6-plus but
// the test is for 7.0.0? because in theory v6 has all v7
// features in it so could be tested against that both. we're
// not doing that now to avoid the complications of interpreting
// the results.
//
if (semver.lt(pkg.version, '7.0.0')) {
  require('./pg/pg6-minus')
} else {
  require('./pg/pg6-plus')
}
