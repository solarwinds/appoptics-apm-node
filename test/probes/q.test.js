var helper = require('../helper')
var tv = helper.tv

describe('probes/q', function () {
  require('./promises')(require('q'))
})
