'use strict'
exports.run = function (ctx, done) {
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      free(err)
      done(err)
      return
    }

    const q = client.query('select * from "test" where "foo" = \'bar\'')
    q.on('end', function (arg) {
      done(null, arg)
    })
    q.on('error', function () {
      done()
    })
  })
}
