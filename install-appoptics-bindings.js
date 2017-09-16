'use strict'

var spawn = require('child_process').spawn

var suffix = 'librato/node-appoptics-bindings.git#single-step-install'
var prefix = ''
var env = process.env

if (env.TEST_GITAUTH) {
    prefix = 'https://' + env.TEST_GITAUTH + ':x-oauth-basic@github.com/'
} else if (env.TEST_GITUSER && env.TEST_GITPASS) {
    prefix = 'https://' + env.TEST_GITUSER + ':' + env.TEST_GITPASS + '@github.com/'
}

var status = spawn('npm', ['install', prefix + suffix], {stdio: 'inherit'})

process.exit(status)
