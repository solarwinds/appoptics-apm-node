var semver = require('semver')
var modules = module.exports = []

test('cassandra-driver',    '>= 0.2.0')
test('co-render',           '*',                'gulp test:probe:koa')
test('express',             '>= 3.0.0')
test('hapi',                '>= 6.0.0')
test('koa-resource-router', '*',                'gulp test:probe:koa')
test('koa-route',           '*',                'gulp test:probe:koa')
test('koa-router',          '*',                'gulp test:probe:koa')
test('koa')
test('levelup',             '>= 0.13.3')
test('memcached',           '>= 0.1.1')
test('mongodb', [
                            '1.2.9 - 1.4.12',
                            '>= 1.4.17 <2.0.0',
                            // TODO: Fix recent mongo versions
                            // '>= 2.0.8'
])
test('mysql',               '> 0.9.0')
test('node-cassandra-cql',  '>= 0.2.0')
test('oracledb')
test('pg', version('>= 0.12.0') ? [
                            '>= 2.8.4'
] : [
                            '>= 0.13.3'
])
test('raw-body')
test('redis',               '>= 0.8.0')
test('restify',             '>= 2.0.0')
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
