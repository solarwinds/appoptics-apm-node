var helper = require('../helper')
var ao = helper.ao

var pkg = require('bluebird/package')

describe('probes/bluebird ' + pkg.version, function () {
  require('./promises')(require('bluebird'))
})
