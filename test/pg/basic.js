exports.run = function (ctx, done) {
  ctx.pg.db.query('SELECT $1::int AS number', ['1'], function (err) {
    ctx.pg.db.end()
    done(err)
  })
}
