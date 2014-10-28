exports.run = function (ctx, done) {
  ctx.cql.execute('SELECT now() FROM system.local', function () {
    done()
  })
}
