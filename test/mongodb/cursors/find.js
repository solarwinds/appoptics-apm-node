exports.run = function (ctx, done) {
  ctx.mongo.collection('test').find({ foo: 'bar' }).nextObject(done)
}
