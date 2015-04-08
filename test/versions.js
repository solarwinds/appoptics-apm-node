var semver = require('semver')
var modules = module.exports = []

test('cassandra-driver',    '>= 0.2.0')
test('co-render',           '*',                'gulp test:probe:koa')
test('express',             '>= 3.0.0')

// Exclude 8.3.0 due to a missing dependency bug
test('hapi',                '>= 6.0.0 < 8.3.0 || >= 8.3.1')
test('koa-resource-router', '*',                'gulp test:probe:koa')
test('koa-route',           '*',                'gulp test:probe:koa')
test('koa-router',          '*',                'gulp test:probe:koa')
test('koa')
test('levelup',             '>= 0.16.0')
test('memcached', version('>= 0.12.0') ? [
                            '>= 0.1.1 < 1.0.0 || >= 2.1.0'
] : [
                            '>= 0.1.1'
])

// Exclude 1.4.13 - 1.4.16 due to bugs
test('mongodb', [
                            '1.2.9 - 1.4.12 || >= 1.4.17 <2.0.0',
                            // TODO: Fix recent mongo versions
                            // '>= 2.0.8'
])
test('mysql',               '> 0.9.0')
test('node-cassandra-cql',  '>= 0.2.0')
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
    task: task || 'gulp test:probe:' + name,
    range: range || '*'
  })
}

function version (range) {
  return semver.satisfies(process.versions.node, range)
}
