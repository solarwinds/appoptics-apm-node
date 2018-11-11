'use strict'

exports.run = function (ctx, done) {
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
