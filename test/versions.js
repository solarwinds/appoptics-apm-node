'use strict'

const semver = require('semver')
const modules = module.exports = []

//
// using a minimum version can avoid testing
// versions known to fail, speeding the test.
//
test('amqp', '>= 0.2.0')
test('amqplib', '>= 0.2.0 < 0.5.0 || > 0.5.0')

test('bcrypt', '>= 0.8.5')
test('bluebird')

test('cassandra-driver', '>= 3.3.0')
test('co-render')
test('director', '>= 1.1.10')
test('express', '>= 3.0.0')

test('generic-pool', '>= 2.4.0')

test('hapi', '>= 9.0.1')
test('koa-resource-router')
test('koa-route', '>= 1.0.1')
test('koa-router', '>= 1.6.0')
test('koa')
test('levelup', '>= 0.17.0')
test('memcached', '>= 2.2.0')

test('mongodb-core', '>= 2.0.0')

test('mongoose', '>= 2.2.1 < 4.2 || >= 4.2.2')

test('mysql', '>= 2.0.0')
test('oracledb', '>=2.0.0')

test('pg', '>= 2.8.4')
test('raw-body')
test('redis', '>= 0.8.0')
test('restify', '>= 2.0.0 < 2.0.2 || >= 2.0.3')
test('tedious', '>= 0.1.5')


//
// Helpers
//

function test (name, range, task) {
  modules.push({
    name: name,
    task: task || './node_modules/gulp/bin/gulp.js test:probe:' + name,
    range: range || '*',
    timeout: 1000 * 60
  })
}

function version (range) {
  return semver.satisfies(process.versions.node, range)
}
