exports.run = function (ctx, done) {
  ctx.redis.multi()
    .set('foo', 'bar')
    .get('foo')
    .exec(done)
}
