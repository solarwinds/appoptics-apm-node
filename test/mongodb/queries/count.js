exports.run = function (ctx, done) {
  ctx.mongo.collection('test').count({
    foo: 'bar',
    baz: 'buz'
  }, done)
}
