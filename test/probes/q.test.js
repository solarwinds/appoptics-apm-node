'use strict'

const { ao } = require('../1.test-common')

const pkg = require('q/package')

describe('probes/q ' + pkg.version, function () {
  before(function () {
    ao.g.testing(__filename)
  })
  require('./promises')(require('q'))
})
