var helper = require('../helper')
var ao = helper.ao

describe('probes/bluebird', function () {
  require('./promises')(require('bluebird'))
})
