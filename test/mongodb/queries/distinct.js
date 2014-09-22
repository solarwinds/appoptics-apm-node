exports.run = function (ctx, done) {
  ctx.mongo.collection('test').distinct('foo', done)
}
