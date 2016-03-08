exports.fnName = function (fn) {
	return fn.name || '(anonymous)'
}

exports.toError = function (error) {
	if (typeof error === 'string') {
		return new Error(error)
	}

	if (error instanceof Error) {
		return error
	}
}
