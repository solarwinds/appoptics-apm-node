'use strict'

const semver = require('semver')
const modules = module.exports = []

test('amqp', '>= 0.1.8')
test('amqplib', '>= 0.2.0')

test('bcrypt',              '>= 0.7.4')
test('bluebird')

test('cassandra-driver',    '>= 0.2.0')
test('co-render')
test('director',            '>= 1.1.10')
test('express',             '>= 3.0.0')

test('generic-pool',        '>= 1.0.3')

// Exclude 8.3.0 and 9.0.0 due to missing dependency bugs
test('hapi',                [
  '>= 6 < 8.3 || >= 8.3.1 < 9 || >= 9.0.1',
  version('>= 4.0.0') ? '>= 9.0.1' : '>= 9.0.1 < 11'
])
test('koa-resource-router')
test('koa-route',           '>= 1.0.1')
test('koa-router',          '>= 1.6.0')
test('koa')
test('levelup',             '>= 0.17.0')
test('memcached', version('>= 4.0.0') ? [
                            '>= 0.1.1 < 1.0.0 || >= 2.2.0'
] : version('>= 0.12.0') ? [
                            '>= 0.1.1 < 1.0.0 || >= 2.1.0'
] : [
                            '>= 0.1.1'
])

// MongoDB 2.x support is handle via mongodb-core instrumentation
test('mongodb-core', '>= 1.1.0')

test('mongoose',     '>= 2.2.1 < 4.2 || >= 4.2.2')

test('mysql',               '>= 2.0.0')
test('oracledb')

// Exclude versions older than 2.8.4 on newer node versions,
// as the native module in older versions is not compatible.
test('pg', version('>= 0.12.0') ? [
                            '>= 2.8.4'
] : [
                            '>= 0.13.3'
])
test('raw-body')
test('redis',               '>= 0.8.0')
test('restify',             '>= 2.0.0 < 2.0.2 || >= 2.0.3')
test('tedious',             '>= 0.1.5')


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
