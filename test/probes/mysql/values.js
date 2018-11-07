'use strict'

exports.run = function (ctx, done) {
  ctx.mysql.query('SELECT ?', ['1'], done)
}
