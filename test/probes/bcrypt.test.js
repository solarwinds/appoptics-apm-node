'use strict'

const helper = require('../helper')
const ao = helper.ao

const bcrypt = require('bcrypt')
const pkg = require('bcrypt/package')

describe('probes/bcrypt ' + pkg.version, function () {
  it('should trace through async bcrypt', function (done) {
    const test = 'foo'
    const password = 'this is a test'

    ao.requestStore.run(function () {
      // kludge to look like previous span
      ao.requestStore.set('lastEvent', true)

      ao.startOrContinueTrace(
        '',
        'test-bcrypt',
        function (cb) {
          ao.requestStore.set(test, 'bar')
          bcrypt.genSalt(10, function (err, salt) {
            bcrypt.hash(password, salt, function (err, hash) {
              bcrypt.compare(password, hash, function (err, res) {
                // the passwords should match
                res.should.equal(true)
                const result = ao.requestStore.get(test)
                // checking 'bar' against result prevents problems if
                // result is undefined.
                'bar'.should.equal(result, 'foo should equal bar')
                return cb()
              })
            })
          })
        },
        {enabled: true},
        function () {done()}
      )
    })
  })
})
