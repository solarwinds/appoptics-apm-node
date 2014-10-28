exports.run = function (ctx, done) {
  ctx.cql.executeAsPrepared('SELECT * from foo where bar=?', ['1'], function () {
    done()
  })
}
