exports.run = function (ctx, done) {
  ctx.cassandra.eachRow('SELECT * from foo', function () {
    // row handler
  }, done)
}
