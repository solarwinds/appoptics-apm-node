'use strict'

const pkg = require('bluebird/package')

describe('probes/bluebird ' + pkg.version, function () {
  require('./promises')(require('bluebird'))
})
