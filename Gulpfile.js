var fs = require('fs')
var gulp = require('gulp')
var mocha = require('gulp-mocha')
var matcha = require('gulp-matcha')
var yuidoc = require('gulp-yuidoc')
var istanbul = require('gulp-istanbul')
var spawn = require('child_process').spawn
var pkg = require('./package')

// Define some name/path mappings for scoped test/coverage tasks
var testTasks = {
  unit: 'test/*.test.js',
  basics: 'test/basics.test.js',
  custom: 'test/custom.test.js',
  error: 'test/error.test.js',
  event: 'test/event.test.js',
  layer: 'test/layer.test.js',
  profile: 'test/profile.test.js',
  probes: 'test/probes/*.test.js'
}

var benchTasks = {
  unit: 'test/*.bench.js',
  custom: 'test/custom.bench.js',
  error: 'test/error.bench.js',
  event: 'test/event.bench.js'
}

// Dynamically define probe test/coverage tasks mapping
function regexFilter (regex) {
  return function (file) {
    return regex.test(file)
  }
}
var probeFiles = fs.readdirSync('test/probes')

var testFileRegex = /\.test\.js$/
probeFiles.filter(regexFilter(testFileRegex)).forEach(function (file) {
  testTasks['probe:' + file.replace(testFileRegex, '')] = [
    'lib/probes/' + file.replace(testFileRegex, '.js'),
    'test/probes/' + file
  ]
})

var benchFileRegex = /\.bench\.js$/
probeFiles.filter(regexFilter(benchFileRegex)).forEach(function (file) {
  benchTasks['probe:' + file.replace(benchFileRegex, '')] = [
    'test/probes/' + file
  ]
})

// Build test tasks for each task type
makeTestTask('test', 'test/**/*.test.js')
makeBenchTask('bench', 'test/**/*.bench.js')
Object.keys(testTasks).forEach(function (task) {
  makeTestTask('test:' + task, testTasks[task])
})
Object.keys(benchTasks).forEach(function (task) {
  makeBenchTask('bench:' + task, benchTasks[task])
})

// Build coverage tasks for each task type
makeCoverageTask('coverage', 'test/**/*.test.js')
Object.keys(testTasks).forEach(function (task) {
  makeCoverageTask('coverage:' + task, testTasks[task])
})

// Build support-matrix tasks for each probe
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
    'test',
    'bench'
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

function makeBenchTask (name, files) {
  gulp.task(name, function (done) {
    var helper = require('./test/helper')

    var tv = helper.tv
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'

    global.tracelyzer = helper.tracelyzer(function () {
      gulp.src(files, {
        read: false
      })
      .pipe(matcha())
      .once('end', process.exit)
    })
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
