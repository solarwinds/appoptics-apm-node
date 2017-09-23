'use strict'

//
// this file exists so that authorization can be add to the package specifier
// to enable access to private repositories or alternate branches.
//
//
//

var spawn = require('child_process').spawn

var suffix = 'node-appoptics-bindings'
var prefix = ''
var env = process.env

if (env.AO_TEST_PACKAGE) {
  // use the specified package
  suffix = env.AO_TEST_PACKAGE
}

if (env.AO_TEST_GITAUTH) {
  // an authentication token is specified
  prefix = 'https://' + env.AO_TEST_GITAUTH + ':x-oauth-basic@github.com/'

} else if (env.AO_TEST_GITUSER && env.AO_TEST_GITPASS) {
  // a user and password are specified
  prefix = 'https://' + env.AO_TEST_GITUSER + ':' + env.AO_TEST_GITPASS + '@github.com/'
}

var status = spawn('npm', ['install', prefix + suffix], { stdio: 'inherit' })

process.exit(status)
