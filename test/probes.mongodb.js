var debug = require('debug')('probes-mongodb')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var semver = require('semver')
var request = require('request')
var MongoDB = require('mongodb').MongoClient
var http = require('http')

var requirePatch = require('../lib/require-patch')
requirePatch.disable()
var pkg = require('mongodb/package.json')
requirePatch.enable()

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
		emitter.removeAllListeners('message')
		emitter.on('message', function (msg) {
			var check = checks.shift()
			if (check) {
				check(msg.toString())
			}

			if ( ! checks.length) {
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
			msg.should.match(/Collection\W*test/)
			check['base-mongodb'](msg)
		},
		'base-mongodb': function (msg) {
			msg.should.match(/Flavor\W*mongodb/)
			msg.should.match(/Database\W*test/)
			msg.should.match(/RemoteHost\W*/)
		}
	}

	function httpTest (test, validations, done) {
		var server = http.createServer(function (req, res) {
			debug('request started')
			test(function (err, data) {
				if (err) return done(err)
				res.end('done')
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
	// Tests
	//
	describe('databases', function () {
		it('should drop', function (done) {
			httpTest(function (done) {
				db.dropDatabase(done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/QueryOp\W*drop/)
					check['base-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})
	})

	describe('collections', function () {

		beforeEach(function (done) {
			db.dropCollection('test', function () {
				db.dropCollection('test2', function () {
					done()
				})
			})
		})

		it('should create_collection', function (done) {
			httpTest(function (done) {
				db.createCollection('test', done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/QueryOp\W*create_collection/)
					check['common-mongodb'](msg)
				},
				function () {},
				function () {},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should options', function (done) {
			httpTest(function (done) {
				db.collection('test').options(done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/QueryOp\W*options/)
					check['common-mongodb'](msg)
				},
				function () {},
				function () {},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should rename', function (done) {
			db.createCollection('test', function () {
				httpTest(function (done) {
					db.renameCollection('test', 'test2', done)
				}, [
					function (msg) {
						msg.should.match(/Layer\W*mongodb/)
						msg.should.match(/Label\W*entry/)
						msg.should.match(/New_Collection_Name\W*test2/)
						msg.should.match(/QueryOp\W*rename/)
						check['common-mongodb'](msg)
					},
					function (msg) {
						msg.should.match(/Layer\W*mongodb/)
						msg.should.match(/Label\W*exit/)
					}
				], done)
			})
		})

		it('should drop_collection', function (done) {
			db.createCollection('test', function () {
				httpTest(function (done) {
					db.dropCollection('test', done)
				}, [
					function (msg) {
						msg.should.match(/Layer\W*mongodb/)
						msg.should.match(/Label\W*entry/)
						msg.should.match(/QueryOp\W*drop_collection/)
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

	describe('basic queries', function () {

		var query_check = {
			'insert-entry': function (msg) {
				msg.should.match(/Layer\W*mongodb/)
				msg.should.match(/Label\W*entry/)
				msg.should.match(/Query\W*{"foo":"bar"/)
				msg.should.match(/QueryOp\W*insert/)
				check['common-mongodb'](msg)
			},
			'insert-exit': function (msg) {
				msg.should.match(/Layer\W*mongodb/)
				msg.should.match(/Label\W*exit/)
			}
		}

		it('should insert', function (done) {
			httpTest(function (done) {
				db.collection('test').insert({ foo: 'bar' }, done)
			}, [
				function (msg) {
					query_check['insert-entry'](msg)
				},
				function (msg) {
					query_check['insert-exit'](msg)
				}
			], done)
		})

		it('should find_and_modify', function (done) {
			httpTest(function (done) {
				db.collection('test').findAndModify({ foo: 'bar' }, [], { baz: 'buz' }, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Query\W*{"foo":"bar"/)
					msg.should.match(/QueryOp\W*find_and_modify/)
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
				db.collection('test').update({ foo: 'bar' }, { bax: 'bux' }, done)
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

		it('should distinct', function (done) {
			httpTest(function (done) {
				db.collection('test').distinct('foo', done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Key\W*foo/)
					msg.should.match(/QueryOp\W*distinct/)
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

		it('should save', function (done) {
			httpTest(function (done) {
				db.collection('test').save({ foo: 'bar', baz: 'buz' }, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Query\W*{"foo":"bar","baz":"buz"}/)
					msg.should.match(/QueryOp\W*save/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					query_check['insert-entry'](msg)
				},
				function (msg) {
					query_check['insert-exit'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], function () {
				db.collection('test').remove({ foo: 'bar', baz: 'buz' }, done)
			})
		})

	})

	describe('indexes', function () {

		var index_check = {
			'create-entry': function (msg) {
				msg.should.match(/Layer\W*mongodb/)
				msg.should.match(/Label\W*entry/)
				msg.should.match(/Index\W*foo/)
				msg.should.match(/QueryOp\W*create_index/)
				check['common-mongodb'](msg)
			},
			'create-exit': function (msg) {
				msg.should.match(/Layer\W*mongodb/)
				msg.should.match(/Label\W*exit/)
			},
			'info-entry': function (msg) {
				msg.should.match(/Layer\W*mongodb/)
				msg.should.match(/Label\W*entry/)
				msg.should.match(/QueryOp\W*index_information/)
				check['common-mongodb'](msg)
			},
			'info-exit': function (msg) {
				msg.should.match(/Layer\W*mongodb/)
				msg.should.match(/Label\W*exit/)
			}
		}

		it('should create_index', function (done) {
			httpTest(function (done) {
				db.collection('test').createIndex('foo', done)
			}, [
				function (msg) {
					index_check['create-entry'](msg)
				},
				function (msg) {
					index_check['create-exit'](msg)
				}
			], done)
		})

		it('should drop_index', function (done) {
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
		it('should ensure_index', function (done) {
			var steps = [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Index\W*{"foo":1}/)
					msg.should.match(/QueryOp\W*ensure_index/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					index_check['info-entry'](msg)
				},
				function () {},
				function () {},
				function (msg) {
					index_check['info-exit'](msg)
				}
			]

			if (semver.satisfies(pkg.version, '1.4.x')) {
				steps.push(function (msg) {
					index_check['create-entry'](msg)
				})
				steps.push(function (msg) {
					index_check['create-exit'](msg)
				})
			}

			steps.push(function (msg) {
				msg.should.match(/Layer\W*mongodb/)
				msg.should.match(/Label\W*exit/)
			})

			httpTest(function (done) {
				db.collection('test').ensureIndex({ foo: 1 }, done)
			}, steps, done)
		})

		it('should index_information', function (done) {
			httpTest(function (done) {
				db.collection('test').indexInformation(done)
			}, [
				function (msg) {
					index_check['info-entry'](msg)
				},
				function () {},
				function () {},
				function (msg) {
					index_check['info-exit'](msg)
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

		it('should drop_indexes', function (done) {
			httpTest(function (done) {
				db.collection('test').dropAllIndexes(done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/Index\W*\*/)
					msg.should.match(/QueryOp\W*drop_indexes/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

	})

	describe('aggregation', function () {

		it('should group', function (done) {
			var keys = function (doc) { return { a: doc.a }; };
			var query = { foo: 'bar' }
			var initial = { count: 0 }
			var reduce = function (obj, prev) { prev.count++; };

			// Escape regex characters in function
			function stringFn (fn) {
				return fn.toString().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
			}

			httpTest(function (done) {
				db.collection('test').group(keys, query, initial, reduce, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(new RegExp('Group_Initial\\W*' + JSON.stringify(initial)))
					msg.should.match(new RegExp('Group_Condition\\W*' + JSON.stringify(query)))
					msg.should.match(new RegExp('Group_Reduce\\W*' + stringFn(reduce)))
					msg.should.match(new RegExp('Group_Key\\W*' + stringFn(keys)))
					msg.should.match(/QueryOp\W*group/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should map_reduce', function (done) {
			var map = function () { emit(this.foo, 1); };
			var reduce = function (k, vals) { return 1; };

			// Escape regex characters in function
			function stringFn (fn) {
				return fn.toString().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
			}

			httpTest(function (done) {
				db.collection('test').mapReduce(map, reduce, {
					out: {
						replace: 'tempCollection',
						readPreference : 'secondary'
					}
				}, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(new RegExp('Map_Function\\W*' + stringFn(map)))
					msg.should.match(new RegExp('Reduce_Function\\W*' + stringFn(reduce)))
					msg.should.match(/QueryOp\W*map_reduce/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

		it('should inline_map_reduce', function (done) {
			var map = function () { emit(this.foo, 1); };
			var reduce = function (k, vals) { return 1; };

			// Escape regex characters in function
			function stringFn (fn) {
				return fn.toString().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
			}

			httpTest(function (done) {
				db.collection('test').mapReduce(map, reduce, {
					out: {
						inline: true
					}
				}, done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(new RegExp('Map_Function\\W*' + stringFn(map)))
					msg.should.match(new RegExp('Reduce_Function\\W*' + stringFn(reduce)))
					msg.should.match(/QueryOp\W*inline_map_reduce/)
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})

	})

	describe('cursors', function () {
		it('should find', function (done) {
			httpTest(function (done) {
				db.collection('test').find({ foo: 'bar' }).nextObject(done)
			}, [
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*entry/)
					msg.should.match(/CursorId\W*/)
					msg.should.match(/QueryOp\W*find/)
					msg.should.match(/Query\W*{"foo":"bar"}/)
					check['base-mongodb'](msg)
				},
				function (msg) {
					msg.should.match(/Layer\W*mongodb/)
					msg.should.match(/Label\W*exit/)
				}
			], done)
		})
	})

})
