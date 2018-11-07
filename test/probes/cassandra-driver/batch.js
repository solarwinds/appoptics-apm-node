'use strict'

exports.run = function (ctx, done) {
  ctx.cassandra.batch([{
    query: 'INSERT INTO foo (bar) values (?)',
    params: ['bux']
  }, {
    query: 'INSERT INTO foo (bar) values (\'bax\')'
  }], done)
}
