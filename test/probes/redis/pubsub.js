var redis = require('redis')

exports.run = function (ctx, done) {
  var db_host = process.env.REDIS_PORT_6379_TCP_ADDR || 'localhost'
  var producer = redis.createClient(6379, db_host, {})

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
