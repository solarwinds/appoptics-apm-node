exports.run = function (ctx, done) {
  ctx.cassandra.execute('SELECT now() FROM system.local', [], { prepare: true }, done)
}
