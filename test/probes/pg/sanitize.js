exports.run = function (ctx, done) {
  ctx.ao.pg.sanitizeSql = true
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      ctx.ao.pg.sanitizeSql = false
      free(err)
      done(err)
      return
    }

    client.query('select * from "test" where "key" = \'value\'', function (err) {
      ctx.ao.pg.sanitizeSql = false
      free()
      done()
    })
  })
}
