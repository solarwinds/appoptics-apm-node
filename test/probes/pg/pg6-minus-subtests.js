'use strict'

function basic (ctx, done) {
  ctx.pg.db.query('SELECT $1::int AS number', ['1'], done)
}

function evented (ctx, done) {
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      free(err)
      done(err)
      return
    }

    const q = client.query(`select * from "${ctx.tName}" where "foo" = 'bar'`)
    q.on('end', function (arg) {
      done(null, arg)
    })
    q.on('error', function () {
      done()
    })
  })
}

function pool (ctx, done) {
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      free(err)
      done(err)
      return
    }

    client.query('SELECT $1::int AS number', ['1'], function (err) {
      free(err)
      done(err)
    })
  })
}

function prepared (ctx, done) {
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      free(err)
      done(err)
      return
    }

    client.query({
      text: 'SELECT $1::int AS number',
      name: 'select n',
      values: ['1']
    }, function (err) {
      if (err) {
        free(err)
        done(err)
        return
      }

      client.query({
        name: 'select n',
        values: ['2']
      }, function (err) {
        free(err)
        done(err)
      })
    })
  })
}

function sanitize (ctx, done) {
  ctx.ao.probes.pg.sanitizeSql = true
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      ctx.ao.probes.pg.sanitizeSql = false
      free(err)
      done(err)
      return
    }

    client.query(`select * from "${ctx.tName}" where "key" = 'value'`, function (err) {
      ctx.ao.probes.pg.sanitizeSql = false
      free()
      done()
    })
  })
}

module.exports = {
  basic,
  evented,
  pool,
  prepared,
  sanitize
}
