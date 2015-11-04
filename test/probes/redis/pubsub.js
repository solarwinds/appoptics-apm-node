var redis = require('redis')

function hostAndPort (ctx) {
  var possibilities = [
    ctx.redis,
    ctx.redis.options,
    ctx.redis.connectionOption,
  ]
  var o
  while (o = possibilities.shift()) {
    if (o.host && o.port) {
      return {
        host: o.host,
        port: o.port
      }
    }
  }
}

exports.run = function (ctx, done) {
  var addr = hostAndPort(ctx)
  var producer = redis.createClient(Number(addr.port), addr.host, {})

  ctx.redis.on('subscribe', function () {
    producer.publish('foo', 'bar')
  })

  ctx.redis.on('message', function (channel, message) {
    channel.should.equal('foo')
    message.should.equal('bar')
    done()
  })

  ctx.redis.subscribe('foo')
}
