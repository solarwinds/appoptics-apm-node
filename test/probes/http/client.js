'use strict'

exports.data = function (ctx) {
  return {url: `${ctx.p}://localhost:${ctx.data.port}/?foo=bar`};
}

exports.run = function (ctx, done) {
  let options = {
    ecdhCurve: 'auto',
    protocol: ctx.p,
    host: 'localhost',
    port: ctx.data.port,
    path: '/?foo=bar'
  }
  // following fails on 8.9.0 - must use options above with ecdhCurve specified. That test
  // fails because the port is missing in the remoteUrl property. Upgraded node to 8.12.0
  // so simple URL works.
  options = ctx.data.url
  ctx.http.get(options, function (res) {
    res.resume()
    res.on('end', done.bind(null, null))
  }).on('error', done)
}
