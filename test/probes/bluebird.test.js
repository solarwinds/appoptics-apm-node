'use strict'

const { startTest, endTest } = require('../1.test-common.js')

const pkg = require('bluebird/package')

describe('probes/bluebird ' + pkg.version, function () {
  before(function () {
    startTest(__filename)
  })
  after(function () {
    endTest()
  })
  require('./promises')(require('bluebird'))
})
