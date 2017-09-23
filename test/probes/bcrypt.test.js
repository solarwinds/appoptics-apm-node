var helper = require('../helper')
var ao = helper.ao

var bcrypt = require('bcrypt')

describe('probes/bcrypt', function () {
  it('should trace through async bcrypt', function (done) {
    ao.requestStore.run(function () {
      // Hack to look like there's a previous layer
      ao.requestStore.set('lastEvent', true)

      var password = 'this is a test'
      ao.requestStore.set('foo', 'bar')

      bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(password, salt, function (err, hash) {
          bcrypt.compare(password, hash, function (err, res) {
            ao.requestStore.get('foo').should.equal('bar')
            done()
          })
        })
      })
    })
  })
})
