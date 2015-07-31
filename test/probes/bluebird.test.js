var helper = require('../helper')
var tv = helper.tv

var Promise = require('bluebird')
var domain = require('domain')

function delay (n) {
  return new Promise(function (resolve) {
    setTimeout(resolve, n)
  })
}

// To prevent the done call from continuing the context,
// the done callbacks must be triggered indirectly.
function indirectDone (done) {
  var stopped = false

  var t = setInterval(function () {
    if (stopped) {
      clearInterval(t)
      done()
    }
  }, 0)

  return {
    done: function () {
      stopped = true
    }
  }
}

describe('probes/bluebird', function () {
  it('should support promises', function (done) {
    var t = indirectDone(done)
    tv.requestStore.run(function () {
      // Hack to look like there's a previous layer
      tv.requestStore.set('lastLayer', true)

      tv.requestStore.set('foo', 'bar')
      delay(100).then(function () {
        tv.requestStore.get('foo').should.equal('bar')
        t.done()
      }, done)
    })
  })

  it('should support promises in domains', function (done) {
    var t = indirectDone(done)
    var d = domain.create()
    d.on('error', done)
    d.run(function () {
      tv.requestStore.run(function () {
        // Hack to look like there's a previous layer
        tv.requestStore.set('lastLayer', true)

        tv.requestStore.set('foo', 'bar')
        delay(100).then(function () {
          tv.requestStore.get('foo').should.equal('bar')
          t.done()
        }, done)
      })
    })
  })
})
