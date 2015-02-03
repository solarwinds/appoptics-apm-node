exports.run = function (ctx, done) {
	var query = ctx.mysql.query('SELECT 1')
	query
	  .on('error', done)
	  .on('result', function (row) {
			// Do nothing
	  })
	  .on('end', function() {
			done()
	  });

}
