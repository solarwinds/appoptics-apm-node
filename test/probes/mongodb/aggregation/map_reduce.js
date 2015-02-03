exports.data = {
  map: function () { emit(this.foo, 1); },
  reduce: function (k, vals) { return 1; },
}

exports.run = function (ctx, done) {
  ctx.mongo.collection('test').mapReduce(ctx.data.map, ctx.data.reduce, {
    out: {
      replace: 'tempCollection',
      readPreference : 'secondary'
    }
  }, done)
}
