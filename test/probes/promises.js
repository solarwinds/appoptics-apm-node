var helper = require('../helper')
var ao = helper.ao

var domain = require('domain')

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


module.exports = function (Promise) {
  function delay (n) {
    return new Promise(function (resolve) {
      setTimeout(resolve, n)
    })
  }

  it('should support promises', function (done) {
    var t = indirectDone(done)
    ao.requestStore.run(function () {
      // Hack to look like there's a previous span
      ao.requestStore.set('lastSpan', true)

      ao.requestStore.set('foo', 'bar')
      delay(100).then(function () {
        ao.requestStore.get('foo').should.equal('bar')
        t.done()
      }, done)
    })
  })

  it('should support promises', function (done) {
    var t = indirectDone(done)
    ao.requestStore.run(function () {
      // Hack to look like there's a previous span
      ao.requestStore.set('lastSpan', true)

      ao.requestStore.set('foo', 'bar')
      delay(100).then(function () {
        ao.requestStore.get('foo').should.equal('bar')
        t.done()
      }, done)
    })
  })

  it('should support promises in domains', function (done) {
    var t = indirectDone(done)
    var d = domain.create()
    d.on('error', done)
    d.run(function () {
      ao.requestStore.run(function () {
        // Hack to look like there's a previous span
        ao.requestStore.set('lastSpan', true)

        ao.requestStore.set('foo', 'bar')
        delay(100).then(function () {
          ao.requestStore.get('foo').should.equal('bar')
          t.done()
        }, done)
      })
    })
  })

  it('should not interfere with untraced promises', function (done) {
    var t = indirectDone(done)
    delay(100).then(function () {
      t.done()
    }, done)
  })

  it('should support progress callbacks', function (done) {
    var t = indirectDone(done)
    ao.requestStore.run(function () {
      // Hack to look like there's a previous span
      ao.requestStore.set('lastSpan', true)

      ao.requestStore.set('foo', 'bar')
      delay(100).then(function () {
        t.done()
      }, done, function () {})
    })
  })
}
