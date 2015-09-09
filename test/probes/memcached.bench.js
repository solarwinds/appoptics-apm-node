var helper = require('../helper')
var tv = helper.tv
var Layer = tv.Layer

var semver = require('semver')

var Memcached = require('memcached')
var pkg = require('memcached/package.json')
var db_host = process.env.MEMCACHED_PORT_11211_TCP_ADDR || '127.0.0.1'

tracelyzer.setMaxListeners(Infinity)

suite('probes/memcached', function () {
  var mem = new Memcached(db_host + ':11211')
  var context = {}

  before(function () {
    tv.requestStore.enter(context)
    layer = new Layer('test', null, {})
    layer.enter()
  })
  after(function () {
    tv.requestStore.exit(context)
    layer.exit()
  })

  bench('add', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.add('foo', 'bar', 10, noop)
  })

  if (semver.satisfies(pkg.version, '>= 0.2.2')) {
    bench('touch', function (done) {
      multi_on(tracelyzer, 2, 'message', after(2, done))
      mem.touch('foo', 10, noop)
    })
  }

  bench('get', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.get('foo', noop)
  })

  bench('getMulti', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.getMulti(['foo','bar'], noop)
  })

  bench('gets', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.gets('foo', noop)
  })

  bench('append', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.append('foo', 'baz', noop)
  })

  bench('prepend', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.prepend('foo', 'baz', noop)
  })

  bench('set', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.set('foo', 'baz', 10, noop)
  })

  bench('replace', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.replace('foo', 1, 10, noop)
  })

  bench('incr', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.incr('foo', 1, noop)
  })

  bench('decr', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.decr('foo', 1, noop)
  })

  bench('del', function (done) {
    multi_on(tracelyzer, 2, 'message', after(2, done))
    mem.del('foo', noop)
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
