'use strict'

exports.run = function (ctx, done) {
  ctx.mysql.query(`INSERT INTO ${ctx.t} SET ?`, {foo: 'bar'}, done)
}
