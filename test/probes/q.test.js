var helper = require('../helper')
var ao = helper.ao

describe('probes/q', function () {
  require('./promises')(require('q'))
})
