/* global it, describe, before, beforeEach, after */
'use strict'

const helper = require('../helper')
const { ao } = require('../1.test-common')

const tedious = require('tedious')
const pkg = require('tedious/package.json')

const semver = require('semver')

const addr = helper.Address.from(process.env.AO_TEST_SQLSERVER_EX || 'mssql:1433')[0]
const user = process.env.AO_TEST_SQLSERVER_EX_USERNAME || 'sa'
const pass = process.env.AO_TEST_SQLSERVER_EX_PASSWORD || 'MeetSQL2017requirements!'

// test with and without a database name
let dbname

describe(`probes.tedious ${pkg.version}`, function () {
  this.timeout(10000)
  let emitter

  beforeEach(function (done) {
    ao.probes.tedious.enabled = true
    setTimeout(function () {
      done()
    }, 250)
  })

  //
  // Intercept messages for analysis
  //
  before(function (done) {
    emitter = helper.appoptics(done)
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.traceMode = 'always'
    ao.g.testing(__filename)
    ao.probes.fs.enabled = false
    ao.probes.dns.enabled = false
  })
  after(function (done) {
    emitter.close(done)
  })

  it('UDP might lose a message', function (done) {
    helper.test(emitter, function (done) {
      ao.instrument('fake', function () { })
      done()
    }, [
      function (msg) {
        msg.should.have.property('Label').oneOf('entry', 'exit')
        msg.should.have.property('Layer', 'fake')
      }
    ], done)
  })

  it('should be configured to sanitize SQL by default', function () {
    ao.probes.tedious.should.have.property('sanitizeSql', true)
    ao.probes.tedious.sanitizeSql = false
  })

  it('should be configured to not tag SQL by default', function () {
    ao.probes.tedious.should.have.property('tagSql', false)
  })

  const checks = {
    'mssql-entry': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'entry')
      if (dbname) {
        msg.should.have.property('Database', dbname)
      }
      msg.should.have.property('Flavor', 'mssql')
      msg.should.have.property('RemoteHost', addr.toString())
    },
    'mssql-exit': function (msg) {
      msg.should.have.property('Layer', 'mssql')
      msg.should.have.property('Label', 'exit')
    }
  }

  dbname = 'test'
  it('should support basic queries with a database name', test_basic)
  it('should support parameters with a database name', test_parameters)
  it('should sanitize query with a database name', test_sanitization)
  it('should truncate long queries with a database name', test_truncate)
  it('should tag queries when feature is enabled', test_tag)
  it('should do nothing when disabled with a database name', test_disabled)
  dbname = undefined
  it('should support basic queries with no database name', test_basic)
  it('should support parameters with no database name', test_parameters)
  it('should sanitize query with no database name', test_sanitization)
  it('should truncate long queries with no database name', test_truncate)
  it('should tag queries when feature is enabled', test_tag)
  it('should do nothing when disabled with no database name', test_disabled)

  function test_basic (done) {
    helper.test(emitter, function (done) {
      query(function () {
        return new tedious.Request("select 42, 'hello world'", onComplete)
        function onComplete (err) {
          done()
        }
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', "select 42, 'hello world'")
        msg.should.not.have.property('QueryTag')
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
        request = new tedious.Request('select @num, @msg', onComplete)
        request.addParameter('num', tedious.TYPES.Int, '42')
        request.addParameter('msg', tedious.TYPES.VarChar, 'hello world')

        function onComplete (err) {
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
        // api changed at that specific version...
        const params = semver.gte(pkg.version, '11.0.10') ? request.parameters : request.originalParameters

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
        const request = new tedious.Request('select 42, @msg', onComplete)
        request.addParameter('msg', tedious.TYPES.VarChar, 'hello world')

        function onComplete (err) {
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query', 'select ?, @msg')
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

  function test_truncate (done) {
    let longQuery = []
    for (let i = 0; i < 1000; i++) {
      longQuery.push('1::int AS number')
    }
    longQuery = 'SELECT ' + longQuery.join(', ')

    helper.test(emitter, function (done) {
      query(function () {
        const request = new tedious.Request(longQuery, onComplete)

        function onComplete (err) {
          done()
        }

        return request
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('Query')
        msg.Query.length.should.not.be.above(2048)
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], function (err) {
      ao.probes.tedious.sanitizeSql = false
      done(err)
    })
  }

  function test_tag (done) {
    ao.probes.tedious.tagSql = true
    helper.test(emitter, function (done) {
      query(function () {
        return new tedious.Request("select 42, 'hello world'", onComplete)
        function onComplete (err) {
          done()
        }
      })
    }, [
      function (msg) {
        checks['mssql-entry'](msg)
        msg.should.have.property('QueryTag', `/*traceparent='${msg['sw.trace_context']}'*/`)
        msg.should.have.property('Query', "select 42, 'hello world'")
      },
      function (msg) {
        checks['mssql-exit'](msg)
      }
    ], function (err) {
      ao.probes.tedious.tagSql = false
      done(err)
    })
  }

  function test_disabled (done) {
    ao.probes.tedious.enabled = false

    helper.test(emitter, function (done) {
      query(function () {
        return new tedious.Request("select 42, 'hello world'", onComplete)
        function onComplete (err) {
          done()
        }
      })
    }, [
      function (msg) {
        // the msg is from the exit of the last span not from the the probe which is disabled.
        msg.should.not.have.property('Query')
        msg.should.have.property('Layer', 'outer')
        done()
      }
    ], done)
  }

  // Query helper
  function query (fn) {
    const settings = {
      authentication: {
        type: 'default',
        options: {
          userName: user,
          password: pass
        }
      },
      server: addr.host,
      port: addr.port,
      options: {
        enableArithAbort: true,
        tdsVersion: '7_1',
        encrypt: false,
        validateBulkLoadParameters: true,
        trustServerCertificate: true
      }
    }
    if (dbname) {
      settings.options.database = dbname
    }
    const connection = new tedious.Connection(settings)

    connection.on('connect', function (err) {
      if (err) {
        throw err
      }
      connection.execSql(fn())
      connection.close()
    })

    connection.connect()
  }

  function findParam (name, params) {
    const val = params.filter(function (v) {
      return v.name === name
    }).shift().value
    // newer versions of package keep params as a buffer.
    // which is reported as string for kv pair
    return Buffer.isBuffer(val) ? val.toString() : val
  }
})
