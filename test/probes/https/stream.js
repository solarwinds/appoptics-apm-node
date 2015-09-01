exports.data = function (ctx) {
  return {
    url: 'https://localhost:' + ctx.data.port + '/?foo=bar'
  }
}

exports.run = function (ctx, done) {
  var req = ctx.https.get(ctx.data.url)
  req.on('response', function (res) {
    res.resume()
    res.on('end', done.bind(null, null))
  })
  req.on('error', done)
}
