exports.run = function (ctx, done) {
  ctx.redis.set('foo', 'bar', done)
}
