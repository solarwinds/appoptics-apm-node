'use strict';

exports.data = function (ctx) {
  return {url: `${ctx.p}://localhost:${ctx.data.port}/?foo=bar`};
}

exports.run = function (ctx, done) {
  const req = ctx.http.get(ctx.data.url)
  req.on('response', function (res) {
    res.resume()
    res.on('end', done.bind(null, null))
  })
  req.on('error', done)
}
