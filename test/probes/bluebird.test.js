var helper = require('../helper')
var tv = helper.tv

describe('probes/bluebird', function () {
  require('./promises')(require('bluebird'))
})
