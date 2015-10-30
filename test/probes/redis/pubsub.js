var redis = require('redis')

exports.run = function (ctx, done) {
  var addr = ctx.redis.connectionOption || ctx.redis.options || ctx.redis
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
