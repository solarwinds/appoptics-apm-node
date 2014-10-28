exports.run = function (ctx, done) {
	ctx.tv.mysql.sanitizeSql = true
	var query = 'SELECT * FROM test WHERE "foo" = ' + ctx.mysql.escape('bar')
	ctx.mysql.query(query, function () {
		ctx.tv.mysql.sanitizeSql = false
		return done.apply(this, arguments)
	})
}
