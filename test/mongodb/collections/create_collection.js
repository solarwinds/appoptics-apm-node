exports.run = function (ctx, done) {
  ctx.mongo.createCollection('test', done)
}
