'use strict'

//
// this file exists so that authorization can be add to the package specifier
// to enable access to private repositories or alternate branches.
//

var spawn = require('child_process').spawnSync

var env = process.env

// development setting to prevent reinstalls when local changes have been made
if (env.AO_TEST_BINDINGS_ARE_PREBUILT) {
  process.exit(0)
}

// default to an npm package name (doesn't start with "node-").
var suffix = 'appoptics-bindings'
var prefix = ''

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
// public github repository by setting the name via AO_TEST_PACKAGE. if the
// repository is public then none of the AO_TEST_GIT* environment variables
// are needd.
if (env.AO_TEST_PACKAGE) {
  suffix = env.AO_TEST_PACKAGE
}

// only show output if desired, unless an error occurs
var opts = env.AO_TEST_BINDINGS_OUTPUT ? {stdio: 'inherit'} : undefined

var results = spawn('npm', ['install', prefix + suffix], opts)

if (results.status || results.error) {
  console.error('Error building appoptics-bindings')
  console.error((results.stderr ? results.stderr : results.status).toString())
}

process.exit(results.status)
