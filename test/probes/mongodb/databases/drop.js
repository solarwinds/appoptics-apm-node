exports.run = function (ctx, done) {
  ctx.mongo.dropDatabase(done)
}
