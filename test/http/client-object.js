exports.data = function (ctx) {
  return {
    hostname: 'localhost',
    port: ctx.data.port,
    path: '/?foo=bar'
  }
}

exports.run = function (ctx, done) {
  ctx.http.get(ctx.data, done.bind(null, null)).on('error', done)
}
