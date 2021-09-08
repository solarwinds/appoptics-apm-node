/* global it, describe, before, beforeEach, after */
'use strict'

if (!process.env.AO_TEST_SQLSERVER_EX) {
  describe('probes.tedious', function () {
    function noop () {}
    it.skip('should support basic queries', noop)
    it.skip('should support parameters', noop)
    it.skip('should support sanitization', noop)
  })
  describe = function () {}
}

const helper = require('../helper')
const { ao } = require('../1.test-common')
const expect = require('chai').expect

const conf = ao.probes.tedious

const pkg = require('tedious/package.json')
const tedious = require('tedious')
const Connection = tedious.Connection
const Request = tedious.Request
const TYPES = tedious.TYPES

// test with and without a database name
let dbname

let addr
if (process.env.AO_TEST_SQLSERVER_EX) {
  addr = helper.Address.from(
    process.env.AO_TEST_SQLSERVER_EX
  )[0]
} else {
  addr = 'mssql:1433'
}
const user = process.env.AO_TEST_SQLSERVER_EX_USERNAME
const pass = process.env.AO_TEST_SQLSERVER_EX_PASSWORD

describe('probes.tedious ' + pkg.version, function () {
  this.timeout(10000)
  let emitter

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
    ao.traceMode = 'always'
    ao.g.testing(__filename)
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

  const checks = {
    'mssql-entry': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'entry')
      if (dbname) {
        expect(msg).property('Database', dbname)
      }
      msg.should.have.property('Flavor', 'mssql')
      msg.should.have.property('RemoteHost', addr.toString())
    },
    'mssql-exit': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'exit')
    }
  }

  if (addr) {
    dbname = 'test'
    it('should support basic queries with a database name', test_basic)
    it('should support parameters with a database name', test_parameters)
    it('should support sanitization with a database name', test_sanitization)
    dbname = undefined
    it('should support basic queries with no database name', test_basic)
    it('should support parameters with no database name', test_parameters)
    it('should support sanitization with no database name', test_sanitization)
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
          count
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
    let request

    helper.test(emitter, function (done) {
      query(function () {
        request = new Request('select @num, @msg', onComplete)
        request.addParameter('num', TYPES.Int, '42')
        request.addParameter('msg', TYPES.VarChar, 'hello world')

        function onComplete (err, count) {
          count
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', 'select @num, @msg')
        msg.should.have.property('QueryArgs')

        const QueryArgs = JSON.parse(msg.QueryArgs)
        const params = request.originalParameters

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
        const request = new Request('select 42, @msg', onComplete)
        request.addParameter('msg', TYPES.VarChar, 'hello world')

        function onComplete (err, count) {
          count
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', 'select 0, @msg')
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
    const settings = {
      userName: user,
      password: pass,
      server: addr.host,
      port: addr.port,
      options: {
        tdsVersion: '7_1',
        encrypt: false
      }
    }
    if (dbname) {
      settings.options.database = dbname
    }
    const connection = new Connection(settings)

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
