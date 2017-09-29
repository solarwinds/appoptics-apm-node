var helper = require('../helper')
var ao = helper.ao
var Layer = ao.Layer

// NOTE: requiring leveldown is necessary as the one that works with
// node 0.11 does not match the one in the devDependencies of levelup.
var level = require('levelup')
var db = level('../../test-db', {
  db: require('leveldown')
})

tracelyzer.setMaxListeners(Infinity)

suite('probes/levelup', function () {
  var context = {}

  before(function () {
    ao.requestStore.enter(context)
    layer = new Layer('test', null, {})
    layer.enter()
  })
  after(function () {
    ao.requestStore.exit(context)
    layer.exit()
  })

  bench('put', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.put('foo', 'bar', noop)
  })

  bench('get', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.get('foo', noop)
  })

  bench('del', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.del('foo', noop)
  })

  bench('batch', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.batch([
      { type: 'put', key: 'foo', value: 'bar' },
      { type: 'del', key: 'foo' },
    ], noop)
  })

  bench('chained batch', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    db.batch()
      .put('foo', 'bar')
      .del('foo')
      .write(noop)
  })
})

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
