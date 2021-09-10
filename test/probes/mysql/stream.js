'use strict'

exports.run = function (ctx, done) {
  const query = ctx.mysql.query('SELECT 1')
  query
    .on('error', done)
    .on('result', function (row) {
      // Do nothing
    })
    .on('end', function () {
      done()
    })
}
