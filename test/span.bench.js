var helper = require('./helper')
var ao = helper.ao
var Span = ao.Span

var span = new Span('test', null, {})

tracelyzer.setMaxListeners(Infinity)

suite('span', function () {
  bench('construction', function () {
    new Span('test', null, {})
  })

  bench('enter', function (done) {
    tracelyzer.once('message', function () { done() })
    var span = new Span('test', null, {})
    span.enter()
  })

  bench('info', function (done) {
    tracelyzer.once('message', function () { done() })
    var span = new Span('test', null, {})
    span.info()
  })

  bench('exit', function (done) {
    tracelyzer.once('message', function () { done() })
    var span = new Span('test', null, {})
    span.exit()
  })

  bench('run sync', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var span = new Span('test', null, {})
    span.run(noop)
  })

  bench('manual sync', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var span = new Span('test', null, {})
    span.enter()
    span.exit()
  })

  bench('run async', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var span = new Span('test', null, {})
    span.run(async)
  })

  bench('manual async', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    var span = new Span('test', null, {})
    span.enter()
    setImmediate(function () {
      span.exit()
    })
  })

  bench('descend from span', function () {
    var span = new Span('test', null, {})
    span.run(descend)
  })
})

function descend () {
  span.descend('test')
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
