exports.run = function (ctx, done) {
	ctx.mysql.query('INSERT INTO test SET ?', {foo: 'bar'}, done)
}
