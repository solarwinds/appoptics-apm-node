exports.run = function (ctx, done) {
  ctx.pg.db.query('SELECT $1::int AS number', ['1'], done)
}
