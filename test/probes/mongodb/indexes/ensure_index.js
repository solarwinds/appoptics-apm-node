exports.run = function (ctx, done) {
  ctx.mongo.collection('test').ensureIndex({
    foo: 1
  }, done)
}
