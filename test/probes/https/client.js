exports.data = function (ctx) {
  return {
    url: 'https://localhost:' + ctx.data.port + '/?foo=bar'
  }
}

exports.run = function (ctx, done) {
  ctx.https.get(ctx.data.url, done.bind(null, null)).on('error', done)
}
