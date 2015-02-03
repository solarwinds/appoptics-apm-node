exports.data = function (ctx) {
  return {
    url: 'http://localhost:' + ctx.data.port + '/?foo=bar'
  }
}

exports.run = function (ctx, done) {
  ctx.http.get(ctx.data.url, done.bind(null, null)).on('error', done)
}
