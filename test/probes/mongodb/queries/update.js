exports.run = function (ctx, done) {
  ctx.mongo.collection('test').update({
    foo: 'bar'
  }, {
    bax: 'bux'
  }, done)
}
