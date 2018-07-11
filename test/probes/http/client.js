'use strict'
exports.data = function (ctx) {
  return {
    url: 'http://localhost:' + ctx.data.port + '/?foo=bar'
  }
}

exports.run = function (ctx, done) {
  ctx.http.get(ctx.data.url, function (res) {
    res.resume()
    res.on('end', done.bind(null, null))
  }).on('error', done)
}
