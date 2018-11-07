'use strict'

exports.run = function (ctx, done) {
  const conf = ctx.ao.probes['cassandra-driver']
  conf.sanitizeSql = true
  ctx.cassandra.execute("SELECT * from foo where bar='1'", function (err) {
    conf.sanitizeSql = false
    done(err)
  })
}
