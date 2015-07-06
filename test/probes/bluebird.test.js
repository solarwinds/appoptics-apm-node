var helper = require('../helper')
var tv = helper.tv

var Promise = require('bluebird')
var domain = require('domain')

function delay (n) {
  return new Promise(function (resolve) {
    setTimeout(resolve, n)
  })
}

describe('probes/bluebird', function () {
  it('should support promises', function (done) {
    tv.requestStore.run(function () {
      // Hack to look like there's a previous layer
      tv.requestStore.set('lastLayer', true)

      tv.requestStore.set('foo', 'bar')
      delay(100).then(function () {
        tv.requestStore.get('foo').should.equal('bar')
        done()
      }, done)
    })
  })

  it('should support promises in domains', function (done) {
    var d = domain.create()
    d.on('error', done)
    d.run(function () {
      tv.requestStore.run(function () {
        // Hack to look like there's a previous layer
        tv.requestStore.set('lastLayer', true)

        tv.requestStore.set('foo', 'bar')
        delay(100).then(function () {
          tv.requestStore.get('foo').should.equal('bar')
          done()
        }, done)
      })
    })
  })
})
