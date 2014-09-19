var redis = require('redis')

exports.run = function (ctx, done) {
  var producer = redis.createClient()

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
