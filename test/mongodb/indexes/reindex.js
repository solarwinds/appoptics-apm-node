exports.run = function (ctx, done) {
  ctx.mongo.collection('test').reIndex(done)
}
