var helper = require('../helper')
var ao = helper.ao
var Layer = ao.Layer

var concat = require('concat-stream')
var zlib = require('zlib')

var classes = [
  'Deflate',
  'Inflate',
  'Gzip',
  'Gunzip',
  'DeflateRaw',
  'InflateRaw',
  'Unzip'
]

var methods = [
  'deflate',
  'deflateRaw',
  'gzip',
  'gunzip',
  'inflate',
  'inflateRaw',
  'unzip'
]

tracelyzer.setMaxListeners(Infinity)

suite('probes/zlib', function () {
  var options = { chunkSize: 1024 }
  var context = {}

  //
  // Prepare input and output values
  //
  var test = new Buffer('test')
  var inputs = {}
  var outputs = {}

  // Deflate/Inflate
  before(function (done) {
    inputs.Deflate = test
    outputs.Inflate = test
    zlib.deflate(test, function (err, res) {
      if (err) return done(err)
      inputs.Inflate = res
      outputs.Deflate = res
      done()
    })
  })

  // DeflateRaw/InflateRaw
  before(function (done) {
    inputs.DeflateRaw = test
    outputs.InflateRaw = test
    zlib.deflateRaw(test, function (err, res) {
      if (err) return done(err)
      inputs.InflateRaw = res
      outputs.DeflateRaw = res
      done()
    })
  })

  // Gzip/Gunzip
  before(function (done) {
    inputs.Gzip = test
    outputs.Gunzip = test
    outputs.Unzip = test
    zlib.gzip(test, function (err, res) {
      if (err) return done(err)
      inputs.Gunzip = res
      inputs.Unzip = res
      outputs.Gzip = res
      done()
    })
  })

  before(function () {
    ao.requestStore.enter(context)
    layer = new Layer('test', null, {})
    layer.enter()
  })
  after(function () {
    ao.requestStore.exit(context)
    layer.exit()
  })

  methods.forEach(function (method) {
    var className = upperFirst(method)
    if (zlib[method]) {
      bench(method, function (done) {
        var cb = after(3, done)
        multi_on(tracelyzer, 2, 'message', cb)
        zlib[method](inputs[className], cb)
      })
    }

    var syncMethod = method + 'Sync'
    if (zlib[syncMethod]) {
      bench(syncMethod, function (done) {
        var cb = after(3, done)
        multi_on(tracelyzer, 2, 'message', cb)
        try { zlib[syncMethod](inputs[className]) }
        catch (e) {}
        process.nextTick(cb)
      })
    }
  })

  //
  // Class tests
  //
  classes.forEach(function (name) {
    if (zlib[name]) {
      bench(name, function (done) {
        var cb = after(3, done)
        multi_on(tracelyzer, 2, 'message', cb)
        var inst = new (zlib[name])(options)
        inst.on('error', cb)
        inst.on('close', cb)
        inst.on('end', cb)

        inst.pipe(concat(noop))
        inst.write(inputs[name])
        inst.end()
      })
    }
  })
})

function noop () {}

function upperFirst (str) {
  return str[0].toUpperCase() + str.slice(1)
}

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
