var helper = require('./helper')
var tv = helper.tv
var Layer = tv.Layer

var layer = new Layer('test', null, {})

tracelyzer.setMaxListeners(Infinity)

suite('layer', function () {
  bench('construction', function () {
    new Layer('test', null, {})
  })

  bench('enter', function (done) {
    tracelyzer.once('message', function () { done() })
    var layer = new Layer('test', null, {})
    layer.enter()
  })

  bench('info', function (done) {
    tracelyzer.once('message', function () { done() })
    var layer = new Layer('test', null, {})
    layer.info()
  })

  bench('exit', function (done) {
    tracelyzer.once('message', function () { done() })
    var layer = new Layer('test', null, {})
    layer.exit()
  })

  bench('run sync', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var layer = new Layer('test', null, {})
    layer.run(noop)
  })

  bench('manual sync', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var layer = new Layer('test', null, {})
    layer.enter()
    layer.exit()
  })

  bench('run async', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var layer = new Layer('test', null, {})
    layer.run(async)
  })

  bench('manual async', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var layer = new Layer('test', null, {})
    layer.enter()
    setImmediate(function () {
      layer.exit()
    })
  })

  bench('descend from layer', function () {
    var layer = new Layer('test', null, {})
    layer.run(descend)
  })
})

function descend () {
  layer.descend('test')
}

function async (wrap) {
  setImmediate(wrap(noop))
}

function noop () {}

function after (n, cb) {
  return function () {
    --n || cb()
  }
}

function multi_on (em, n, ev, cb) {
  function step () {
    if (n-- > 0) em.once(ev, function () {
      cb.apply(this, arguments)
      step()
    })
  }
  step()
}
