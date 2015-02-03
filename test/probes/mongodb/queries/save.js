exports.run = function (ctx, done) {
  ctx.mongo.collection('test').save({
    foo: 'bar',
    baz: 'buz'
  }, done)
}
