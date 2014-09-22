exports.run = function (ctx, done) {
  ctx.pg.connect(ctx.pg.address, function (err, client, free) {
    if (err) {
      free(err)
      done(err)
      return
    }

    client.query({
      text: 'SELECT $1::int AS number',
      name: 'select n',
      values: ['1']
    }, function (err) {
      if (err) {
        free(err)
        done(err)
        return
      }

      client.query({
        name: 'select n',
        values: ['2']
      }, function (err) {
        free(err)
        done(err)
      })
    })
  })
}
