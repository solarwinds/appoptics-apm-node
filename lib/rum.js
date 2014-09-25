var fs = require('fs')

var ajax = fs.readFileSync(__dirname + '/rum/ajax-header.tmpl')
var no_ajax = fs.readFileSync(__dirname + '/rum/no-ajax-header.tmpl')
var footer = fs.readFileSync(__dirname + '/rum/footer.tmpl')

function tmpl (text, data) {
	return text.toString().replace(/#{([^{}]*)}/g, function (a, expression) {
		var fn = new Function('data', 'with (data) { return ' + expression + ' }')
		return fn(data)
	})
}

function header (rumId, traceId) {
	return tmpl(no_ajax, {
		rumId: rumId,
		traceId: traceId
	})
}

function ajaxHeader (rumId, traceId) {
	return tmpl(ajax, {
		rumId: rumId,
		traceId: traceId
	})
}

exports.header = header
exports.ajaxHeader = ajaxHeader
exports.footer = function () {
	return footer.toString()
}

exports.inject = function (data, rumId, traceId, xhr) {
	var header = xhr ? exports.ajaxHeader : exports.header
	data.rumHeader = header(rumId, traceId)
	data.rumFooter = footer.toString()
}
