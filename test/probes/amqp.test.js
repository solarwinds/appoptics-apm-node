var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')
var amqp = require('amqp')
var db_host = process.env.RABBITMQ_PORT_5672_TCP_ADDR || 'localhost'

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
      host: db_host
    }, {
      reconnect: false
    })
    client.on('ready', done)
  })
  after(function (done) {
    // NOTE: 1.x has no disconnect() and socket.end() is not safe.
    if (client.disconnect) {
      client.on('close', function () {
        done()
      })
      client.disconnect()
    } else {
      done()
    }
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

  if (process.env.HAS_CELERY) {
    var celery = require('node-celery')

    it('should work with celery', function (done) {
      var client = celery.createClient({
        CELERY_BROKER_URL: 'amqp://guest:guest@localhost:5672//',
        CELERY_RESULT_BACKEND: 'amqp',
        CELERY_TASK_SERIALIZER: 'json',
        CELERY_RESULT_SERIALIZER: 'json'
      })

      client.on('error', done)

      client.on('connect', function () {
        helper.httpTest(emitter, function (done) {
          client.call('tasks.add', [1, 1], function(data) {
            client.end()
            done()
          })
        }, [
          function (msg) {
            checks.entry(msg)
            msg.should.have.property('RemoteHost', 'localhost:5672')
            msg.should.have.property('ExchangeName', 'test')
            console.log(msg)
          },
          function (msg) {
            checks.exit(msg)
          }
        ], done)
      })
    })
  }
})
