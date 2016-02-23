var helper = require('../helper')
var tv = helper.tv

var bcrypt = require('bcrypt')

describe('probes/bcrypt', function () {
  it('should trace through async bcrypt', function (done) {
    tv.requestStore.run(function () {
      // Hack to look like there's a previous layer
      tv.requestStore.set('lastEvent', true)

      var password = 'this is a test'
      tv.requestStore.set('foo', 'bar')
      
      bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(password, salt, function (err, hash) {
          bcrypt.compare(password, hash, function (err, res) {
            tv.requestStore.get('foo').should.equal('bar')
            done()
          })
        })
      })
    })
  })
})
