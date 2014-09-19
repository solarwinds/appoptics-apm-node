var debug = require('debug')('probes-mongodb')
var helper = require('./helper')
var should = require('should')
var tv = require('..')
var addon = tv.addon

var semver = require('semver')
var request = require('request')
var MongoDB = require('mongodb').MongoClient
var http = require('http')

var requirePatch = require('../lib/require-patch')
requirePatch.disable()
var pkg = require('mongodb/package.json')
requirePatch.enable()

describe('probes.mongodb', function () {
	this.timeout(5000)
	var ctx = {}
	var emitter
	var db

	//
	// Intercept tracelyzer messages for analysis
	//
	before(function (done) {
		emitter = helper.tracelyzer(done)
		tv.sampleRate = addon.MAX_SAMPLE_RATE
		tv.traceMode = 'always'
	})
	before(function (done) {
		MongoDB.connect('mongodb://localhost/test', function (err, _db) {
			if (err) return done(err)
			ctx.mongo = db = _db
			done()
		})
	})
	after(function (done) {
		emitter.close(done)
	})

	var check = {
		'common-mongodb': function (msg) {
			msg.should.have.property('Collection', 'test')
			check['base-mongodb'](msg)
		},
		'base-mongodb': function (msg) {
			msg.should.have.property('Flavor', 'mongodb')
			msg.should.have.property('Database', 'test')
			msg.should.have.property('RemoteHost')
		},
		'mongo-exit': function (msg) {
			msg.should.have.property('Layer', 'mongodb')
			msg.should.have.property('Label', 'exit')
		}
	}

	//
	// Tests
	//
	describe('databases', function () {
		it('should drop', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/databases/drop'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'drop')
					check['base-mongodb'](msg)
				},
				check['mongo-exit']
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
			var steps = [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'create_collection')
					check['common-mongodb'](msg)
				}
			]

			// The db.command used in collection.count called cursor.nextObject
			if (semver.satisfies(pkg.version, '<1.4.11')) {
				steps.push(function () {})
				steps.push(function () {})
			}

			steps.push(check['mongo-exit'])

			helper.httpTest(
				emitter,
				helper.run(ctx, 'mongodb/collections/create_collection'),
				steps,
				done
			)
		})

		it('should options', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/collections/options'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'options')
					check['common-mongodb'](msg)
				},
				function () {},
				function () {},
				check['mongo-exit']
			], done)
		})

		it('should rename', function (done) {
			db.createCollection('test', function () {
				helper.httpTest(emitter, helper.run(ctx, 'mongodb/collections/rename'), [
					function (msg) {
						msg.should.have.property('Layer', 'mongodb')
						msg.should.have.property('Label', 'entry')
						msg.should.have.property('QueryOp', 'rename')
						msg.should.have.property('New_Collection_Name', 'test2')
						check['common-mongodb'](msg)
					},
					check['mongo-exit']
				], done)
			})
		})

		it('should drop_collection', function (done) {
			db.createCollection('test', function () {
				helper.httpTest(emitter, helper.run(ctx, 'mongodb/collections/drop_collection'), [
					function (msg) {
						msg.should.have.property('Layer', 'mongodb')
						msg.should.have.property('Label', 'entry')
						msg.should.have.property('QueryOp', 'drop_collection')
						check['common-mongodb'](msg)
					},
					check['mongo-exit']
				], done)
			})
		})

	})

	describe('basic queries', function () {

		var query_check = {
			'insert-entry': function (msg) {
				msg.should.have.property('Layer', 'mongodb')
				msg.should.have.property('Label', 'entry')
				msg.should.have.property('QueryOp', 'insert')
				check['common-mongodb'](msg)
			}
		}

		it('should insert', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/queries/insert'), [
				function (msg) {
					msg.should.have.property('Query', '{"foo":"bar"}')
					query_check['insert-entry'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should find_and_modify', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/queries/find_and_modify'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'find_and_modify')
					msg.should.have.property('Query', '{"foo":"bar"}')
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'exit')
				}
			], done)
		})

		it('should update', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/queries/update'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'update')
					msg.should.have.property('Query', '{"foo":"bar"}')
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should distinct', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/queries/distinct'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'distinct')
					msg.should.have.property('Key', 'foo')
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should count', function (done) {
			var steps = [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'count')
					msg.should.have.property('Query', '{"foo":"bar","baz":"buz"}')
					check['common-mongodb'](msg)
				}
			]

			// The db.command used in collection.count called cursor.nextObject
			if (semver.satisfies(pkg.version, '>=1.3.10 <1.3.17')) {
				steps.push(function () {})
				steps.push(function () {})
			}

			steps.push(function (msg) {
				check['mongo-exit'](msg)
			})

			helper.httpTest(
				emitter,
				helper.run(ctx, 'mongodb/queries/count'),
				steps,
				done
			)
		})

		it('should remove', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/queries/remove'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'delete')
					msg.should.have.property('Query', '{"foo":"bar","baz":"buz"}')
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should save', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/queries/save'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'save')
					msg.should.have.property('Query', '{"foo":"bar","baz":"buz"}')
					check['common-mongodb'](msg)
				},
				function (msg) {
					msg.should.have.property('Query', '{"foo":"bar","baz":"buz"}')
					query_check['insert-entry'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], function () {
				db.collection('test').remove({ foo: 'bar', baz: 'buz' }, done)
			})
		})

	})

	describe('indexes', function () {

		var index_check = {
			'create-entry': function (msg) {
				msg.should.have.property('Layer', 'mongodb')
				msg.should.have.property('Label', 'entry')
				msg.should.have.property('QueryOp', 'create_index')
				check['common-mongodb'](msg)
			},
			'info-entry': function (msg) {
				msg.should.have.property('Layer', 'mongodb')
				msg.should.have.property('Label', 'entry')
				msg.should.have.property('QueryOp', 'index_information')
				check['common-mongodb'](msg)
			}
		}

		it('should create_index', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/indexes/create_index'), [
				function (msg) {
					msg.should.have.property('Index', '"foo"')
					index_check['create-entry'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should drop_index', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/indexes/drop_index'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'drop_index')
					msg.should.have.property('Index', 'foo_1')
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should ensure_index', function (done) {
			var steps = [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'ensure_index')
					msg.should.have.property('Index', '{"foo":1}')
					check['common-mongodb'](msg)
				},
				function (msg) {
					index_check['info-entry'](msg)
				}
			]

			if (semver.satisfies(pkg.version, '<1.4.11')) {
				steps.push(function () {})
				steps.push(function () {})
			}

			steps.push(function (msg) {
				check['mongo-exit'](msg)
			})

			if (semver.satisfies(pkg.version, '1.4.x')) {
				steps.push(function (msg) {
					msg.should.have.property('Index', '{"foo":1}')
					index_check['create-entry'](msg)
				})
				steps.push(function (msg) {
					check['mongo-exit'](msg)
				})
			}

			steps.push(function (msg) {
				check['mongo-exit'](msg)
			})

			helper.httpTest(
				emitter,
				helper.run(ctx, 'mongodb/indexes/ensure_index'),
				steps,
				done
			)
		})

		it('should index_information', function (done) {
			var steps = [
				function (msg) {
					index_check['info-entry'](msg)
				}
			]

			if (semver.satisfies(pkg.version, '<1.4.11')) {
				steps.push(function () {})
				steps.push(function () {})
			}

			steps.push(function (msg) {
				check['mongo-exit'](msg)
			})

			helper.httpTest(
				emitter,
				helper.run(ctx, 'mongodb/indexes/index_information'),
				steps,
				done
			)
		})

		it('should reindex', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/indexes/reindex'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'reindex')
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should drop_indexes', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/indexes/drop_indexes'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'drop_indexes')
					msg.should.have.property('Index', '*')
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

	})

	describe('aggregation', function () {

		it('should group', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/aggregation/group'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'group')

					msg.should.have.property('Group_Initial', JSON.stringify(ctx.data.initial))
					msg.should.have.property('Group_Condition', JSON.stringify(ctx.data.query))
					msg.should.have.property('Group_Reduce', ctx.data.reduce.toString())
					msg.should.have.property('Group_Key', ctx.data.keys.toString())
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should map_reduce', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/aggregation/map_reduce'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'map_reduce')

					msg.should.have.property('Map_Function', ctx.data.map.toString())
					msg.should.have.property('Reduce_Function', ctx.data.reduce.toString())
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

		it('should inline_map_reduce', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/aggregation/inline_map_reduce'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'inline_map_reduce')

					msg.should.have.property('Map_Function', ctx.data.map.toString())
					msg.should.have.property('Reduce_Function', ctx.data.reduce.toString())
					check['common-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})

	})

	describe('cursors', function () {
		it('should find', function (done) {
			helper.httpTest(emitter, helper.run(ctx, 'mongodb/cursors/find'), [
				function (msg) {
					msg.should.have.property('Layer', 'mongodb')
					msg.should.have.property('Label', 'entry')
					msg.should.have.property('QueryOp', 'find')
					msg.should.have.property('Query', '{"foo":"bar"}')
					msg.should.have.property('CursorId')
					check['base-mongodb'](msg)
				},
				function (msg) {
					check['mongo-exit'](msg)
				}
			], done)
		})
	})

})
