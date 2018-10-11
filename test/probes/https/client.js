'use strict'

exports.data = function (ctx) {
  return {
    url: 'https://localhost:' + ctx.data.port + '/?foo=bar'
  }
}

exports.run = function (ctx, done) {
  let options = {
    ecdhCurve: 'auto',
    protocol: 'https:',
    host: 'localhost',
    port: ctx.data.port,
    path: '/?foo=bar'
  }
  // following fails on 8.9.0 - must use options above with ecdhCurve specified. That test
  // fails because the port is missing in the remoteUrl property. Upgraded node to 8.12.0
  // so simple URL works.
  options = ctx.data.url
  ctx.https.get(options, function (res) {
    res.resume()
    res.on('end', done.bind(null, null))
  }).on('error', done)
}
