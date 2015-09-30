var helper = require('../helper')
var tv = helper.tv

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

describe('probes.zlib', function () {
  var options = { chunkSize: 1024 }
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  var checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'zlib')
      msg.should.have.property('Label', 'entry')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'zlib')
      msg.should.have.property('Label', 'exit')
    }
  }

  function upperFirst (str) {
    return str[0].toUpperCase() + str.slice(1)
  }

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

  //
  // Tests
  //
  describe('async', function () {
    methods.forEach(function (method) {
      var className = upperFirst(method)
      if (zlib[method]) {
        it('should support ' + method, function (done) {
          helper.httpTest(emitter, function (done) {
            zlib[method](inputs[className], function (err, buf) {
              if (err) return done(err)
              buf.toString().should.equal(outputs[className].toString())
              done()
            })
          }, [
            function (msg) {
              checks.entry(msg)
              msg.should.have.property('Operation', method)
              msg.should.have.property('Async', true)
            },
            function (msg) {
              checks.exit(msg)
            }
          ], done)
        })
      }
    })
  })

  describe('sync', function () {
    methods.forEach(function (method) {
      var className = upperFirst(method)
      var syncMethod = method + 'Sync'
      if (zlib[syncMethod]) {
        it('should support ' + syncMethod, function (done) {
          helper.httpTest(emitter, function (done) {
            try {
              var buf = zlib[syncMethod](inputs[className])
              buf.toString().should.equal(outputs[className].toString())
            } catch (e) {}
            process.nextTick(done)
          }, [
            function (msg) {
              checks.entry(msg)
              msg.should.have.property('Operation', syncMethod)
              msg.should.not.have.property('Async')
            },
            function (msg) {
              checks.exit(msg)
            }
          ], done)
        })
      }
    })
  })

  describe('classes', function () {
    classes.forEach(function (name) {
      if (zlib[name]) {
        it('should support ' + name, function (done) {
          helper.httpTest(emitter, function (done) {
            var inst = new (zlib[name])(options)
            inst.on('error', done)
            inst.on('close', done)
            inst.on('end', done)

            inst.pipe(concat(function (buf) {
              buf.toString().should.equal(outputs[name].toString())
            }))

            inst.write(inputs[name])
            inst.end()
          }, [
            function (msg) {
              checks.entry(msg)
              msg.should.have.property('Options', JSON.stringify(options))
              msg.should.have.property('Operation', name)
              msg.should.have.property('Async', true)
            },
            function (msg) {
              checks.exit(msg)
            }
          ], done)
        })
      }
    })
  })

  describe('creators', function () {
    classes.forEach(function (name) {
      var creator = 'create' + name
      if (zlib[creator]) {
        it('should support ' + creator, function (done) {
          helper.httpTest(emitter, function (done) {
            var inst = new zlib[creator](options)
            inst.on('error', done)
            inst.on('close', done)
            inst.on('end', done)

            inst.pipe(concat(function (buf) {
              buf.toString().should.equal(outputs[name].toString())
            }))

            inst.write(inputs[name])
            inst.end()
          }, [
            function (msg) {
              checks.entry(msg)
              msg.should.have.property('Options', JSON.stringify(options))
              msg.should.have.property('Operation', name)
              msg.should.have.property('Async', true)
            },
            function (msg) {
              checks.exit(msg)
            }
          ], done)
        })
      }
    })
  })

})
