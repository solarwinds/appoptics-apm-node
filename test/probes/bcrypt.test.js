var helper = require('../helper')
var ao = helper.ao

var bcrypt = require('bcrypt')
var pkg = require('bcrypt/package')

describe('probes/bcrypt ' + pkg.version, function () {
  it('should trace through async bcrypt', function (done) {
    var test = 'foo'
    var password = 'this is a test'

    ao.requestStore.run(function () {
      // kludge to look like previous span
      ao.requestStore.set('lastEvent', true)

      var res = ao.startOrContinueTrace(
        '',
        'test-bcrypt',
        function (cb) {
          ao.requestStore.set(test, 'bar')
          bcrypt.genSalt(10, function (err, salt) {
            bcrypt.hash(password, salt, function (err, hash) {
              bcrypt.compare(password, hash, function (err, res) {
                var result = ao.requestStore.get(test)
                // checking 'bar' against result prevents problems if
                // result is undefined.
                'bar'.should.equal(result, 'foo should equal bar')
                return cb()
              })
            })
          })
        },
        { enabled: true },
        function () { done() }
      )
    })
  })
})
