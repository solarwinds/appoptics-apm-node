exports.run = function (ctx, done) {
	ctx.mysql.pool.query('SELECT 1', done)
}
