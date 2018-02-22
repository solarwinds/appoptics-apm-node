exports.run = function (ctx, done) {
	ctx.ao.probes.mysql.sanitizeSql = true
	var query = 'SELECT * FROM test WHERE "foo" = ' + ctx.mysql.escape('bar')
	ctx.mysql.query(query, function () {
		ctx.ao.probes.mysql.sanitizeSql = false
		return done.apply(this, arguments)
	})
}
