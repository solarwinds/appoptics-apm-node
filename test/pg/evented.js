exports.run = function (ctx, done) {
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      free(err)
      done(err)
      return
    }

    var q = client.query('select * from "table" where "foo" = \'bar\'')
    q.on('end', done.bind(null, null))
    q.on('error', function () {
      done()
    })
  })
}
