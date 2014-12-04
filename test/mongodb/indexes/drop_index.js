exports.run = function (ctx, done) {
  ctx.mongo.collection('test').dropIndex('foo_1', function (err, res) {
    done()
  })
}
