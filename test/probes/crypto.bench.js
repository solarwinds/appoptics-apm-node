var helper = require('../helper')
var ao = helper.ao
var Span = ao.Span

var crypto = require('crypto')

tracelyzer.setMaxListeners(Infinity)

suite('probes/crypto', function () {
  var context = {}

  before(function () {
    ao.requestStore.enter(context)
    span = new Span('test', null, {})
    span.enter()
  })
  after(function () {
    span.exit()
    ao.requestStore.exit(context)
  })

  if (crypto.pbkdf2) {
    bench('pbkdf2', function (done) {
      multi_on(tracelyzer, 2, 'message', after(2, done))
      crypto.pbkdf2('secret', 'salt', 4096, 512, function () {})
    })
  }

  if (crypto.pbkdf2Sync) {
    bench('pbkdf2Sync', function (done) {
      multi_on(tracelyzer, 2, 'message', after(2, done))
      try { crypto.pbkdf2Sync('secret', 'salt', 4096, 512) }
      catch (e) {}
    })
  }

  if (crypto.createDiffieHellman) {
    bench('DiffieHellman.computeSecret', function (done) {
      multi_on(tracelyzer, 2, 'message', after(2, done))
      var a = crypto.createDiffieHellman(512)
      a.generateKeys()
      a.computeSecret(a.getPublicKey())
    })
  }

  if (crypto.createECDH) {
    bench('ECDH.computeSecret', function (done) {
      multi_on(tracelyzer, 2, 'message', after(2, done))
      var a = crypto.createECDH('secp521r1')
      a.generateKeys()
      a.computeSecret(a.getPublicKey())
    })
  }

  var methods = [
    'publicEncrypt',
    'privateEncrypt',
    'publicDecrypt',
    'privateDecrypt'
  ]

  var buf = new Buffer('foo')
  methods.forEach(function (method) {
    bench(method, function (done) {
      multi_on(tracelyzer, 2, 'message', after(2, done))
      try { crypto[method]('secret', buf) }
      catch (e) {}
    })
  })
})

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
