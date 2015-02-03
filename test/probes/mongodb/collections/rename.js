exports.run = function (ctx, done) {
  ctx.mongo.renameCollection('test', 'test2', done)
}
