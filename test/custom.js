var helper = require('./helper')
var tv = require('..')

//
//                 ^     ^
//            __--| \:::/ |___
//    __---```   /    ;;;  \  ``---___
//      -----__ |   (@  \\  )       _-`
//             ```--___   \\ \   _-`
//                     ````----``
//     /````\  /```\   /```\  |`\   ||
//     ||``\| |/```\| |/```\| ||\\  ||
//      \\    ||   || ||   || || || ||
//        \\  ||   || ||   || || || ||
//     |\__|| |\___/| |\___/| ||  \\||
//     \____/  \___/   \___/  ||   \_|
//
var soon = global.setImmediate || process.nextTick

describe('custom', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  beforeEach(function (done) {
    this.timeout(5000)
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  afterEach(function (done) {
    this.timeout(5000)
    emitter.close(done)
  })

  it('should custom instrument sync code', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrumentSync(function () {}, function (last) {
        return last.descend('test', {
          Foo: 'bar'
        })
      })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Foo', 'bar')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })

  it('should custom instrument async code', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.instrument(soon, done, function (last) {
        return last.descend('test', {
          Foo: 'bar'
        })
      })
    }, [
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'entry')
        msg.should.have.property('Foo', 'bar')
      },
      function (msg) {
        msg.should.have.property('Layer', 'test')
        msg.should.have.property('Label', 'exit')
      }
    ], done)
  })
})
