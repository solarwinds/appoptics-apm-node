exports.run = function (ctx, done) {
  ctx.mongo.collection('test').createIndex('foo', done)
}
