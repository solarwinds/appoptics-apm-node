exports.run = function (ctx, done) {
  ctx.mongo.collection('test').findAndModify({
    foo: 'bar'
  }, [], {
    baz: 'buz'
  }, done)
}
