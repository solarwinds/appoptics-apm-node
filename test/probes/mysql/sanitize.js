'use strict'

exports.run = function (ctx, done) {
  ctx.ao.probes.mysql.sanitizeSql = true
  const query = `SELECT * FROM ${ctx.t} WHERE "foo" = ` + ctx.mysql.escape('bar')
  ctx.mysql.query(query, function () {
    ctx.ao.probes.mysql.sanitizeSql = false
    return done.apply(this, arguments)
  })
}
