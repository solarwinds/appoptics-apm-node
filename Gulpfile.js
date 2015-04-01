var fs = require('fs')
var gulp = require('gulp')
var mocha = require('gulp-mocha')
var yuidoc = require('gulp-yuidoc')
var istanbul = require('gulp-istanbul')
var spawn = require('child_process').spawn
var pkg = require('./package')

// Define some name/path mappings for scoped test/coverage tasks
var testTasks = {
  'basics': 'test/*.test.js',
  'addon': 'test/addon/*.test.js',
  'probes': 'test/probes/*.test.js'
}

// Dynamically define probe test/coverage tasks mapping
var testFileRegex = /\.test\.js$/
fs.readdirSync('test/probes').filter(function (file) {
  return testFileRegex.test(file)
}).forEach(function (file) {
  testTasks['probe:' + file.replace(testFileRegex, '')] = [
    'lib/probes/' + file.replace(testFileRegex, '.js'),
    'test/probes/' + file
  ]
})

// Build test tasks for each task type
makeTestTask('test', 'test/**/*.test.js')
Object.keys(testTasks).forEach(function (task) {
  makeTestTask('test:' + task, testTasks[task])
})

// Build coverage tasks for each task type
makeCoverageTask('coverage', 'test/**/*.test.js')
Object.keys(testTasks).forEach(function (task) {
  makeCoverageTask('coverage:' + task, testTasks[task])
})

// Build support-matrix tasks for each probe
gulp.task('support-matrix', function (cb) {
  var p = spawn('alltheversions')
  p.stdout.pipe(process.stdout)
  p.stderr.pipe(process.stderr)
  p.on('close', cb)
})

require('./test/versions').map(function (mod) {
  return mod.name
}).forEach(makeMatrixTask)

gulp.task('support-matrix', function (cb) {
  var p = spawn('alltheversions', ['--verbose'])
  p.stdout.pipe(process.stdout)
  p.stderr.pipe(process.stderr)
  p.on('close', cb)
})

gulp.task('docs', function () {
  return gulp.src('lib/**/*.js')
    .pipe(yuidoc({
      project: {
        name: pkg.name,
        description: pkg.description,
        version: pkg.version,
        url: 'http://appneta.com'
      }
    }))
    .pipe(gulp.dest('./docs'))
})

gulp.task('watch', function () {
  gulp.watch([
    '{lib,test}/**/*.js',
    'index.js'
  ], [
    'test'
  ])
})

gulp.task('default', [
  'test'
])

//
// Helpers
//

function tester () {
  require('./')
  require('should')

  return mocha({
    reporter: 'spec',
    timeout: 5000
  })
}

function makeTestTask (name, files) {
  gulp.task(name, function () {
    return gulp.src(files, {
      read: false
    })
    .pipe(tester())
    .once('error', function (e) {
      console.error(e.message)
      process.exit(1)
    })
    .once('end', process.exit)
  })
}

function makeCoverageTask (name, files) {
  gulp.task(name, function () {
    return gulp.src(files)
      .pipe(istanbul())
      .pipe(istanbul.hookRequire())
      .on('finish', function () {
        return gulp.src(files)
          .pipe(tester())
          .pipe(istanbul.writeReports())
          .once('end', process.exit)
      })
  })
}

function makeMatrixTask (name) {
  gulp.task('support-matrix:' + name, function (cb) {
    var p = spawn('alltheversions', [
      '--module', name,
      '--verbose'
    ])
    p.stdout.pipe(process.stdout)
    p.stderr.pipe(process.stderr)
    p.on('close', cb)
  })
}
