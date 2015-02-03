exports.run = function (ctx, done) {
  ctx.mongo.dropCollection('test', done)
}
