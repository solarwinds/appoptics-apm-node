var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')

var pkg = require('tedious/package.json')
var tedious = require('tedious')
var Connection = tedious.Connection
var Request = tedious.Request
var TYPES = tedious.TYPES

var addr = helper.Address.from(
  process.env.TEST_SQLSERVER_EX || 'localhost:1433'
)[0]
var user = process.env.TEST_SQLSERVER_EX_USERNAME
var pass = process.env.TEST_SQLSERVER_EX_PASSWORD

describe('probes.tedious', function () {
  this.timeout(10000)
  var emitter
  var ctx = {}
  var cluster
  var pool
  var db

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    tv.fs.enabled = false
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    tv.fs.enabled = true
    emitter.close(done)
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

  it('should support basic queries', function (done) {
    helper.httpTest(emitter, function (done) {
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
  })

  it('should support parameters', function (done) {
    var request

    helper.httpTest(emitter, function (done) {
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
  })

  it('should support sanitization', function (done) {
    helper.httpTest(emitter, function (done) {
      tv.tedious.sanitizeSql = true
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
      tv.tedious.sanitizeSql = false
      done(err)
    })
  })

  // Query helper
  function query (fn) {
    var connection = new Connection({
      database: 'test',
      userName: user,
      password: pass,
      server: addr.host,
      port: addr.port
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
