exports.run = function (ctx, done) {
  var s = ctx.cassandra.stream('SELECT * from foo')
  s.on('error', done)
  s.on('end', done)
  s.resume()
}
