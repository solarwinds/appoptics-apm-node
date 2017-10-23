'use strict'

//
// this file exists so that authorization can be add to the package specifier
// to enable access to private repositories or alternate branches.
//

var spawn = require('child_process').spawn

// default to an npm package name (doesn't start with "node-").
var suffix = 'appoptics-bindings'
var prefix = ''
var env = process.env

// if either git auth mechanism is specified then default to a
// github package name (starts with "node-"). so if accessing an
// npm-public package is required then AO_TEST_(GITAUTH, GITUSER,
// and GITPASS) must be undefined or empty.
if (env.AO_TEST_GITAUTH) {
  // an authentication token is specified
  prefix = 'https://' + env.AO_TEST_GITAUTH + ':x-oauth-basic@github.com/'
  suffix = 'librato/node-appoptics-bindings'

} else if (env.AO_TEST_GITUSER && env.AO_TEST_GITPASS) {
  // a user and password are specified
  prefix = 'https://' + env.AO_TEST_GITUSER + ':' + env.AO_TEST_GITPASS + '@github.com/'
  suffix = 'librato/node-appoptics-bindings'
}

// if the package is specified override the default. this allows specifying a
// branch other than master or a specific version. it also allows accessing a
// public github repository by setting the name via AO_TEST_PACKAGE but not
// setting any of the AO_TEST_GIT* authentication environment variables.
if (env.AO_TEST_PACKAGE) {
  // use the specified package
  suffix = env.AO_TEST_PACKAGE
}

var status = spawn('npm', ['install', prefix + suffix], { stdio: 'inherit' })

process.exit(status)
