var debug = require('debug')('probes-mongodb')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var request = require('request')
var MongoDB = require('mongodb').MongoClient
var http = require('http')

describe('probes.mongodb', function () {
	var emitter
	var db

	//
	// Intercept tracelyzer messages for analysis
	//
	before(function (done) {
		emitter = helper.tracelyzer(done)
		oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE
		oboe.traceMode = 'always'
	})
	before(function (done) {
		MongoDB.connect('mongodb://localhost/test', function (err, _db) {
			if (err) return done(err)
			db = _db
			done()
		})
	})
	after(function (done) {
		emitter.close(done)
	})

	//
	// Helper to run checks against a server
	//
	function doChecks (checks, done) {
		emitter.on('message', function (msg) {
			var check = checks.shift()
			if (check) {
				check(msg.toString())
			}

			if ( ! checks.length) {
				emitter.removeAllListeners('message')
				done()
			}
		})
	}

	var check = {
		'http-entry': function (msg) {
			msg.should.match(/Layer\W*http/)
			msg.should.match(/Label\W*entry/)
			debug('entry is valid')
		},
		'http-exit': function (msg) {
			msg.should.match(/Layer\W*http/)
			msg.should.match(/Label\W*exit/)
			debug('exit is valid')
		},
		'common-mongodb': function (msg) {
			msg.should.match(/Flavor\W*mongodb/)
			msg.should.match(/Collection\W*test/)
			msg.should.match(/Database\W*test/)
			msg.should.match(/RemoteHost\W*/)
		}
	}

	function httpTest (test, validations, done) {
		var server = http.createServer(function (req, res) {
			debug('request started')
			test(function (err, data) {
				if (err) return done(err)
				res.end(JSON.stringify(data))
			})
		})

		validations.unshift(check['http-entry'])
		validations.push(check['http-exit'])
		doChecks(validations, function () {
			server.close(done)
		})

		server.listen(function () {
			var port = server.address().port
			debug('test server listening on port ' + port)
			request('http://localhost:' + port)
		})
	}

	//
	// Basic queries
	//
	describe('basic queries', function () {
		it('should insert', function (done) {
			httpTest(function (done) {
				db.collection('test').insert({ foo: 'bar' }, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Query\W*{"foo":"bar"/)
					msg.should.match(/QueryOp\W*insert/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should update', function (done) {
			httpTest(function (done) {
				db.collection('test').update({ foo: 'bar' }, { baz: 'buz' }, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Query\W*{"foo":"bar"/)
					msg.should.match(/QueryOp\W*update/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should findOne', function (done) {
			httpTest(function (done) {
				db.collection('test').findOne({ foo: 'bar', baz: 'buz' }, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Query\W*{"foo":"bar","baz":"buz"}/)
					msg.should.match(/QueryOp\W*find/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should count', function (done) {
			httpTest(function (done) {
				db.collection('test').count({ foo: 'bar', baz: 'buz' }, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Query\W*{"foo":"bar","baz":"buz"}/)
					msg.should.match(/QueryOp\W*count/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should remove', function (done) {
			httpTest(function (done) {
				db.collection('test').remove({ foo: 'bar', baz: 'buz' }, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Query\W*{"foo":"bar","baz":"buz"}/)
					msg.should.match(/QueryOp\W*delete/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})
	})

	describe('indexes', function () {
		it('should create an index', function (done) {
			httpTest(function (done) {
				db.collection('test').createIndex('foo', done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Index\W*foo_1/)
					msg.should.match(/Query\W*{"foo":1}/)
					msg.should.match(/QueryOp\W*create_index/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should drop an index', function (done) {
			httpTest(function (done) {
				db.collection('test').dropIndex('foo_1', done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Index\W*foo_1/)
					msg.should.match(/QueryOp\W*drop_index/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		// TODO: Make this pass
		it.skip('should ensure an index', function (done) {
			httpTest(function (done) {
				db.collection('test').ensureIndex('foo', done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Index\W*foo_1/)
					msg.should.match(/Query\W*{"foo":1}/)
					msg.should.match(/QueryOp\W*ensure_index/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should fetch index information', function (done) {
			httpTest(function (done) {
				db.collection('test').indexInformation(done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/QueryOp\W*index_information/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should reindex', function (done) {
			httpTest(function (done) {
				db.collection('test').reIndex(done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/QueryOp\W*reindex/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})
	})

})
