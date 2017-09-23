var helper = require('./helper')
var ao = helper.ao
var Layer = ao.Layer
var Event = ao.Event

var err = new Error('test')
var event = new Event('error-test', 'info')

tracelyzer.setMaxListeners(Infinity)

suite('event', function () {
  var context = {}

  before(function () {
    ao.requestStore.enter(context)
  })

  after(function () {
    ao.requestStore.exit(context)
  })

  bench('construction', function () {
    new Event('test', 'entry')
  })

  bench('toString()', function () {
    event.toString()
  })

  bench('enter', function () {
    event.enter()
  })

  bench('send', function (done) {
    tracelyzer.once('message', function () { done() })
    var e = new Event('test', 'entry')
    e.send()
  })
})

function builder (layer) {
  return layer.descend('test')
}

function error (done) {
  done(err)
}
