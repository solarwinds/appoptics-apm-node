exports.data = {
  initial: { count: 0 },
  query: { foo: 'bar' },
  keys: function (doc) { return { a: doc.a }; },
  reduce: function (obj, prev) { prev.count++; },
}

exports.run = function (ctx, done) {
  ctx.mongo.collection('test').group(
    ctx.data.keys,
    ctx.data.query,
    ctx.data.initial,
    ctx.data.reduce,
    done
  )
}
