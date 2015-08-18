var helper = require('./helper')
var tv = helper.tv
var Layer = tv.Layer

suite('custom', function () {
  var context = {}

  before(function () {
    tv.requestStore.enter(context)
  })

  after(function () {
    tv.requestStore.exit(context)
  })

  bench('custom instrumentation with name', function () {
    tv.instrument('test', noop)
  })

  bench('custom instrumentation with builder function', function () {
    tv.instrument(builder, noop)
  })

  bench('custom instrumentation with callback', function (done) {
    tv.instrument('test', callIt, function () {
      setImmediate(done)
    })
  })
})

function builder (layer) {
  return layer.descend('test')
}

function noop () {}

function callIt (done) {
  done()
}
