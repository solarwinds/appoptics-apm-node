var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var amqp = require('amqp')

describe('probes.amqp', function () {
  var emitter
  var ctx = {}
  var client
  var db

  //
  // Define some general message checks
  //
  var checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'amqp')
      msg.should.have.property('Label', 'entry')
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'amqp')
      msg.should.have.property('Label', 'exit')
    }
  }

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

  // Yes, this is really, actually needed.
  // Sampling may actually prevent reporting,
  // if the tests run too fast. >.<
  beforeEach(function (done) {
    helper.padTime(done)
  })

  //
  // Create a connection for the tests to use
  //
  before(function (done) {
    client = amqp.createConnection({
      host: 'localhost'
    }, {
      reconnect: false
    })
    client.on('ready', done)
  })
  after(function (done) {
    client.on('close', function () {
      done()
    })
    client.disconnect()
  })

  //
  // Define tests
  //
  it('should support confirm exchanges', function (done) {
    helper.httpTest(emitter, function (done) {
      var ex = client.exchange('test', {
        confirm: true
      }, function () {
        ex.publish('test', {
          foo: 'bar'
        }, {
          mandatory: true
        }, function () {
          done()
        })
      })
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('RemoteHost', 'localhost:5672')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should support no-confirm exchanges', function (done) {
    helper.httpTest(emitter, function (done) {
      var ex = client.exchange('test', {}, function () {
        var task = ex.publish('test', {
          foo: 'bar'
        })
        done()
      })
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('RemoteHost', 'localhost:5672')
        msg.should.have.property('ExchangeName', 'test')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should bind event listeners', function (done) {
    helper.httpTest(emitter, function (done) {
      var q = client.queue('node-default-exchange', function() {
        q.bind("#")

        q.on('queueBindOk', function() {
          q.on('basicConsumeOk', function () {
            var ex = client.exchange('test', {}, function () {
              var task = ex.publish('test', {
                foo: 'bar'
              })
              done()
            })
          })

          q.subscribe({
            routingKeyInPayload: true
          }, function () {

          })
        })
      })
    }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('RemoteHost', 'localhost:5672')
        msg.should.have.property('ExchangeName', 'test')
      },
      function (msg) {
        checks.exit(msg)
      }
    ], done)
  })

  it('should bind event listeners even for instances constructed outside the request', function (done) {
    var next = helper.after(2, function () {
      helper.httpTest(emitter, function (done) {
        q.on('basicConsumeOk', function () {
          var task = ex.publish('test', {
            foo: 'bar'
          })
          done()
        })

        q.subscribe({
          routingKeyInPayload: true
        }, function () {})
      }, [
      function (msg) {
        checks.entry(msg)
        msg.should.have.property('RemoteHost', 'localhost:5672')
        msg.should.have.property('ExchangeName', 'test')
      },
      function (msg) {
        checks.exit(msg)
      }
      ], done)
    })

    var ex = client.exchange('test', {}, next)
    var q = client.queue('node-default-exchange', function () {
      q.bind("#")

      q.on('queueBindOk', next)
    })
  })
})
