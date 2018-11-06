'use strict'

exports.run = function (ctx, done) {
  ctx.cassandra.eachRow('SELECT * from foo where bar=?', ['1'], function () {
    // row handler
  }, done)
}
