'use strict'

const fs = require('fs')

//
// this is modified from the apm-node-lambda-layer/util/get-lambda-version.js
//
// the main difference is that this does not write the modified version into package.json.
//
// it also reads synchronously and doesn't write to the console.
//
// append '-version-suffix' to the version and return that.
//
function getLambdaVersion (file) {
  const bytes = fs.readFileSync(file, 'utf8')
  const pkg = JSON.parse(bytes)

  // lambda releases will be numbered by the existing version number with a
  // version suffix appended.
  if (!pkg.version || !pkg.appoptics || !pkg.appoptics['version-suffix']) {
    throw new Error('expected to find version and appoptics.version-suffix properties')
  }

  // combine and return
  return `${pkg.version}-${pkg.appoptics['version-suffix']}`
}

module.exports = getLambdaVersion
