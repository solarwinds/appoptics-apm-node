'use strict'

module.exports = function (ao, ctx) {
  // common checks
  const checks = {
    entry: function (msg) {
      msg.should.have.property('Layer', 'postgres')
      msg.should.have.property('Label', 'entry')
      msg.should.have.property('Database', 'test')
      msg.should.have.property('Flavor', 'postgresql')
      msg.should.have.property('RemoteHost', ctx.addr.toString())
    },
    exit: function (msg) {
      msg.should.have.property('Layer', 'postgres')
      msg.should.have.property('Label', 'exit')
    }
  }

  //
  // test basic query
  //
  const basicChecks = [
    function (msg) {
      checks.entry(msg)
      msg.should.have.property('Query', 'SELECT $1::int AS number')
      msg.should.have.property('QueryArgs', '["1"]')
      msg.should.not.have.property('QueryTag')
    },
    function (msg) {
      checks.exit(msg)
    }
  ]

  const cBasicText = 'should trace a basic query using callback'
  function cBasic (done) {
    ctx.client.get().query('SELECT $1::int AS number', ['1'], done)
  }

  const pBasicText = 'should trace a basic query using promises'
  function pBasic (done) {
    ctx.client.get().query('SELECT $1::int AS number', ['1'])
      .then(results => {
        done()
      })
      .catch(e => {
        done(e)
      })
  }

  const basic = {
    cb: { test: cBasic, text: cBasicText },
    p: { test: pBasic, text: pBasicText },
    checks: basicChecks
  }

  //
  // test prepared statement
  //
  const preparedQuery = 'SELECT $1::int AS number'
  const preparedChecks = [
    function (msg) {
      checks.entry(msg)
      msg.should.have.property('Query', preparedQuery)
      msg.should.have.property('QueryArgs', '["1"]')
    },
    function (msg) {
      checks.exit(msg)
    },
    function (msg) {
      checks.entry(msg)
      msg.should.have.property('Query', preparedQuery)
      msg.should.have.property('QueryArgs', '["2"]')
    },
    function (msg) {
      checks.exit(msg)
    }
  ]

  const cPreparedText = 'should trace a prepared statement using a callback'
  function cPrepared (done) {
    ctx.client.getNoRelease(function (err, client) {
      client.query(
        { text: preparedQuery, name: 'select n', values: ['1'] },
        function (err, results) {
          if (err) {
            ctx.client.release(client)
            done(err)
            return
          }
          client.query(
            { name: 'select n', values: ['2'] },
            function (err) {
              ctx.client.release(client)
              done(err)
            }
          )
        }
      )
    })
  }

  const pPreparedText = 'should trace a prepared statement using promises'
  function pPrepared (done) {
    let client
    ctx.client.getNoRelease()
      .then(results => {
        client = results
      })
      .then(() => {
        return client.query({ text: preparedQuery, name: 'select n', values: ['1'] })
      })
      .then(results => {
        return client.query({ name: 'select n', values: ['2'] })
      })
      .then(results => {
        ctx.client.release(client)
        done()
      })
      .catch(e => {
        ctx.client.release(client)
        done(e)
      })
  }

  const prepared = {
    cb: { test: cPrepared, text: cPreparedText },
    p: { test: pPrepared, text: pPreparedText },
    checks: preparedChecks
  }

  //
  // test sanitize
  //
  const sanitizeQuery = `select * from "${ctx.tName}" where "foo" = '?'`
  const sanitizeChecks = [
    function (msg) {
      checks.entry(msg)
      msg.should.have.property('Query', sanitizeQuery)
    },
    function (msg) {
      checks.exit(msg)
    }
  ]

  const cSanitizeText = 'should sanitize query when no value list using a callback'
  function cSanitize (done) {
    ctx.ao.probes.pg.sanitizeSql = true

    ctx.client.get().query(
      sanitizeQuery,
      function (err) {
        ctx.ao.probes.pg.sanitizeSql = false
        done()
      }
    )
  }

  const pSanitizeText = 'should sanitize query when no value list using promises'
  function pSanitize (done) {
    ctx.ao.probes.pg.sanitizeSql = true

    ctx.client.get().query(sanitizeQuery)
      .then(res => {
        ctx.ao.probes.pg.sanitizeSql = false
        done()
      })
      .catch(e => {
        ctx.ao.probes.pg.sanitizeSql = false
        done()
      })
  }

  const sanitize = {
    cb: { test: cSanitize, text: cSanitizeText },
    p: { test: pSanitize, text: pSanitizeText },
    checks: sanitizeChecks
  }

  //
  // truncate long queries
  //
  const truncateChecks = [
    function (msg) {
      checks.entry(msg)
      msg.should.have.property('Query')
      msg.Query.length.should.not.be.above(2048)
    },
    function (msg) {
      checks.exit(msg)
    }
  ]
  let longQuery = []
  for (let i = 0; i < 1000; i++) {
    longQuery.push('1::int AS number')
  }
  longQuery = 'SELECT ' + longQuery.join(', ')

  const ctruncateText = 'should truncate long queries using a callback'
  function ctruncate (done) {
    ctx.client.get().query(longQuery, function (err) {
      done(err)
    })
  }

  const ptruncateText = 'should truncate long queries using promises'
  function ptruncate (done) {
    ctx.client.get().query(longQuery)
      .then(results => {
        done()
      })
      .catch(e => {
        done(e)
      })
  }

  const truncate = {
    cb: { test: ctruncate, text: ctruncateText },
    p: { test: ptruncate, text: ptruncateText },
    checks: truncateChecks
  }

  //
  // test tag queries
  //
  const tagChecks = [
    function (msg) {
      checks.entry(msg)
      msg.should.have.property('Query', 'SELECT $1::int AS number')
      msg.should.have.property('QueryArgs', '["1"]')
      msg.should.have.property('QueryTag', `/*traceparent='${msg['sw.trace_context']}'*/`)
    },
    function (msg) {
      checks.exit(msg)
    }
  ]

  const cTagText = 'should tag queries when feature is enabledusing callback'
  function cTag (done) {
    ctx.ao.probes.pg.tagSql = true
    ctx.client.get().query('SELECT $1::int AS number', ['1'], function () {
      ctx.ao.probes.pg.tagSql = false
      done()
    })
  }

  const pTagText = 'should tag queries when feature is enabled using promises'
  function pTag (done) {
    ctx.ao.probes.pg.tagSql = true
    ctx.client.get().query('SELECT $1::int AS number', ['1'])
      .then(results => {
        ctx.ao.probes.pg.tagSql = false
        done()
      })
      .catch(e => {
        ctx.ao.probes.pg.tagSql = false
        done(e)
      })
  }

  const tag = {
    cb: { test: cTag, text: cTagText },
    p: { test: pTag, text: pTagText },
    checks: tagChecks
  }

  //
  // verify no trace when disabled.
  //
  const disabledChecks = []

  const cDisabledText = 'should do nothing when disabled using a callback'
  function cDisabled (done) {
    ctx.ao.probes.pg.enabled = false
    ctx.client.get().query('SELECT $1::int AS number', ['1'], function (err) {
      ctx.ao.probes.pg.enabled = true
      done(err)
    })
  }

  const pDisabledText = 'should do nothing when disabled using promises'
  function pDisabled (done) {
    ctx.ao.probes.pg.enabled = false
    ctx.client.get().query('SELECT $1::int AS number', ['1'])
      .then(results => {
        ctx.ao.probes.pg.enabled = true
        done()
      })
      .catch(e => {
        ctx.ao.probes.pg.enabled = true
        done(e)
      })
  }

  const disabled = {
    cb: { test: cDisabled, text: cDisabledText },
    p: { test: pDisabled, text: pDisabledText },
    checks: disabledChecks
  }

  return {
    basic,
    prepared,
    sanitize,
    truncate,
    tag,
    disabled
  }
}
