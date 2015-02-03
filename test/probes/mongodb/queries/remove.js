exports.run = function (ctx, done) {
  ctx.mongo.collection('test').remove({
    foo: 'bar',
    baz: 'buz'
  }, done)
}
