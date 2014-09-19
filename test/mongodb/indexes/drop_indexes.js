exports.run = function (ctx, done) {
  ctx.mongo.collection('test').dropAllIndexes(done)
}
