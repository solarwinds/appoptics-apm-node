if ( ! process.env.AO_TEST_SQLSERVER_EX) {
  describe('probes.tedious', function () {
    function noop () {}
    it.skip('should support basic queries', noop)
    it.skip('should support parameters', noop)
    it.skip('should support sanitization', noop)
  })
  return
}

var helper = require('../helper')
var ao = helper.ao
var addon = ao.addon
var conf = ao.probes.tedious

var should = require('should')

var pkg = require('tedious/package.json')
var tedious = require('tedious')
var Connection = tedious.Connection
var Request = tedious.Request
var TYPES = tedious.TYPES

var addr
if (process.env.AO_TEST_SQLSERVER_EX) {
  addr = helper.Address.from(
    process.env.AO_TEST_SQLSERVER_EX
  )[0]
} else {
  addr = 'mssql'
}
var user = process.env.AO_TEST_SQLSERVER_EX_USERNAME
var pass = process.env.AO_TEST_SQLSERVER_EX_PASSWORD

describe('probes.tedious', function () {
  this.timeout(10000)
  var emitter
  var ctx = {}
  var cluster
  var pool
  var db

  beforeEach(function (done) {
    setTimeout(function () {
      done()
    }, 250)
  })

  //
  // Intercept appoptics messages for analysis
  //
  before(function (done) {
    ao.probes.fs.enabled = false
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'
  })
  after(function (done) {
    ao.probes.fs.enabled = true
    emitter.close(done)
  })

  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
        function (msg) {
          msg.should.have.property('Label').oneOf('entry', 'exit'),
            msg.should.have.property('Layer', 'fake')
        }
      ], done)
  })


  it('should sanitize SQL by default', function () {
    conf.should.have.property('sanitizeSql', true)
    conf.sanitizeSql = false
  })

  var checks = {
    'mssql-entry': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', 'test')
      msg.should.have.property('Flavor', 'mssql')
      msg.should.have.property('RemoteHost', addr.toString())
    },
    'mssql-exit': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'exit')
    }
  }

  if (addr) {
    it('should support basic queries', test_basic)
    it('should support parameters', test_parameters)
    it('should support sanitization', test_sanitization)
  } else {
    it.skip('should support basic queries', test_basic)
    it.skip('should support parameters', test_parameters)
    it.skip('should support sanitization', test_sanitization)
  }

  function test_basic (done) {
    helper.test(emitter, function (done) {
      query(function () {
        return new Request("select 42, 'hello world'", onComplete)
        function onComplete (err, count) {
          done()
        }
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', "select 42, 'hello world'")
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], done)
  }

  function test_parameters (done) {
    var request

    helper.test(emitter, function (done) {
      query(function () {
        request = new Request("select @num, @msg", onComplete)
        request.addParameter('num', TYPES.Int, '42')
        request.addParameter('msg', TYPES.VarChar, 'hello world')

        function onComplete (err, count) {
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', "select @num, @msg")
        msg.should.have.property('QueryArgs')

        var QueryArgs = JSON.parse(msg.QueryArgs)
        var params = request.originalParameters

        QueryArgs.should.have.property('num', findParam('num', params))
        QueryArgs.should.have.property('msg', findParam('msg', params))
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], done)
  }

  function test_sanitization (done) {
    helper.test(emitter, function (done) {
      ao.probes.tedious.sanitizeSql = true
      query(function () {
        var request = new Request("select 42, @msg", onComplete)
        request.addParameter('msg', TYPES.VarChar, 'hello world')

        function onComplete (err, count) {
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', "select 0, @msg")
        msg.should.not.have.property('QueryArgs')
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], function (err) {
      ao.probes.tedious.sanitizeSql = false
      done(err)
    })
  }

  // Query helper
  function query (fn) {
    var connection = new Connection({
      userName: user,
      password: pass,
      server: addr.host,
      port: addr.port,
      options: {
        database: 'test',
        tdsVersion: '7_1'
      }
    })

    connection.on('connect', function () {
      connection.execSql(fn())
    })
  }

  function findParam (name, params) {
    return params.filter(function (v) {
      return v.name === name
    }).shift().value
  }

})
