var helper = require('./helper')
var tv = helper.tv
var Layer = tv.Layer
var Event = tv.Event

var err = new Error('test')
var event = new Event('error-test', 'info')

suite('error', function () {
  var context = {}

  before(function () {
    tv.requestStore.enter(context)
  })

  after(function () {
    tv.requestStore.exit(context)
  })

  bench('assigning error', function () {
    event.error = err
  })

  bench('record sync error', function () {
    try {
      tv.instrument(builder, function () {
        throw error
      })
    } catch (e) {}
  })

  bench('record async error', function (done) {
    tv.instrument(builder, error, done)
  })
})

function builder (layer) {
  return layer.descend('test')
}

function error (done) {
  setImmediate(done.bind(null, err))
}
