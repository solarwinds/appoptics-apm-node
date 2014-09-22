exports.run = function (ctx, done) {
  ctx.tv.pg.sanitizeSql = true
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      ctx.tv.pg.sanitizeSql = false
      free(err)
      done(err)
      return
    }

    client.query('select * from "table" where "key" = \'value\'', function (err) {
      ctx.tv.pg.sanitizeSql = false
      free()
      done()
    })
  })
}
