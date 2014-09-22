exports.run = function (ctx, done) {
  ctx.mongo.collection('test').insert({ foo: 'bar' }, done)
}
