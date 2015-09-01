exports.data = function (ctx) {
  return {
    hostname: 'localhost',
    port: ctx.data.port,
    path: '/?foo=bar'
  }
}

exports.run = function (ctx, done) {
  ctx.https.get(ctx.data, function (res) {
    res.resume()
    res.on('end', done.bind(null, null))
  }).on('error', done)
}
