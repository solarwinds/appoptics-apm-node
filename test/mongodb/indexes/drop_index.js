exports.run = function (ctx, done) {
  ctx.mongo.collection('test').dropIndex('foo_1', function (err, res) {
    if (err) return done(err)
    done(res.ok ? null : new Error('did not drop index'))
  })
}
