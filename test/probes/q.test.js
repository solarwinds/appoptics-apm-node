var helper = require('../helper')
var ao = helper.ao

var pkg = require('q/package')

describe('probes/q ' + pkg.version, function () {
  require('./promises')(require('q'))
})
