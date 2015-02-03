exports.run = function (ctx, done) {
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
