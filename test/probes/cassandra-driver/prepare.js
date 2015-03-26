exports.run = function (ctx, done) {
  ctx.cassandra.execute('SELECT now() FROM system.local', null, { prepare: true }, done)
}
