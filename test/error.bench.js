var helper = require('./helper')
var ao = helper.ao
var Layer = ao.Layer
var Event = ao.Event

var err = new Error('test')
var event = new Event('error-test', 'info')

suite('error', function () {
  var context = {}

  before(function () {
    ao.requestStore.enter(context)
  })

  after(function () {
    ao.requestStore.exit(context)
  })

  bench('assigning error', function () {
    event.error = err
  })

  bench('record sync error', function () {
    try {
      ao.instrument(builder, function () {
        throw error
      })
    } catch (e) {}
  })

  bench('record async error', function (done) {
    ao.instrument(builder, error, done)
  })
})

function builder (layer) {
  return layer.descend('test')
}

function error (done) {
  setImmediate(done.bind(null, err))
}
