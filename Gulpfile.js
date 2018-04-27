'use strict'

const fs = require('fs')
const path = require('path')
const gulp = require('gulp')
const babel = require('gulp-babel')
const mocha = require('gulp-mocha')
const matcha = require('gulp-matcha')
const yuidoc = require('gulp-yuidoc')
const istanbul = require('gulp-istanbul')
const spawn = require('child_process').spawn
const mkdirp = require('mkdirp')
const pkg = require('./package')

// Ensure existence of dist and probe directories
gulp.task('dist', function (cb) {
  mkdirp('dist', cb)
})
gulp.task('dist/probes', ['dist'], function (cb) {
  mkdirp('dist/probes', cb)
})

// Describe basic tasks and their associated files
const tasks = {
  unit: {
    lib: 'dist/*.js',
    test: 'test/*.test.js',
    bench: 'test/*.bench.js',
  },
  probes: {
    lib: 'dist/probes/*.js',
    test: 'test/probes/*.test.js',
    bench: 'test/probes/*.bench.js',
  }
}

// Make individual unit test tasks
const unitTests = fs.readdirSync('test/')
unitTests.forEach(function (file) {
  if (!/.+\.test\.js$/.test(file)) return

  const name = file.replace(/^(.+)\.[^\.]+\.js/, '$1')
  // add the task to the dictionary.
  tasks['unit:' + name] = {
    lib: 'dist/*.js',
    test: 'test/' + file,
    bench: 'test/' + name + '.bench.js'
  }
})

// Describe probe tasks automatically
const probes = fs.readdirSync('lib/probes')
probes.forEach(function (probe) {
  const name = probe.replace(/\.js$/, '')
  const task = tasks['probe:' + name] = {
    lib: 'dist/probes/' + probe
  }

  const test = 'test/probes/' + name + '.test.js'
  if (fs.existsSync(test)) {
    task.test = test
  }

  const bench = 'test/probes/' + name + '.bench.js'
  if (fs.existsSync(bench)) {
    task.bench = bench
  }
})

// Create build tasks
makeBuildTask('build', 'dist/**/*.js')
makeBuildTask('build:probe', 'dist/probe/*.js')
Object.keys(tasks).forEach(function (name) {
  const task = tasks[name]
  if (task.lib) {
    makeBuildTask('build:' + name, task.lib)
  }
})

// Create test tasks
makeTestTask('test', 'test/**/*.test.js')
Object.keys(tasks).forEach(function (name) {
  const task = tasks[name]
  if (task.test) {
    makeTestTask('test:' + name, task.test)
  }
})

// Create coverage tasks
makeCoverageTask('coverage', 'test/**/*.test.js')
Object.keys(tasks).forEach(function (name) {
  const task = tasks[name]
  if (task.test) {
    makeCoverageTask('coverage:' + name, task.test, task.lib)
  }
})

// Create benchmark tasks
makeBenchTask('bench', 'test/**/*.bench.js')
Object.keys(tasks).forEach(function (name) {
  const task = tasks[name]
  if (task.bench) {
    makeBenchTask('bench:' + name, task.bench)
  }
})

// Create support-matrix tasks
require('./test/versions')
  .map(function (mod) { return mod.name })
  .forEach(makeMatrixTask)

gulp.task('support-matrix', function () {
  return spawn('alltheversions', ['--verbose'], {
    stdio: 'inherit'
  })
})

// Create auto-docs task
gulp.task('docs', function () {
  return gulp.src('lib/**/*.js')
    .pipe(yuidoc({
      project: {
        name: pkg.name,
        description: pkg.description,
        version: pkg.version,
        url: 'https://www.appoptics.com/'
      }
    }))
    .pipe(gulp.dest('./docs'))
})

// Create watcher task
gulp.task('watch', function () {
  Object.keys(tasks).forEach(function (name) {
    if (name === 'probes') return
    const task = tasks[name]

    const shouldBench = task.bench && !process.env.SKIP_BENCH

    // These spawns tasks in a child processes. This is useful for
    // preventing state persistence between runs in a watcher and
    // for preventing crashes or exits from ending the watcher.
    function coverage () {
      return spawn('gulp', ['coverage:' + name], {
        stdio: 'inherit'
      })
    }

    function bench () {
      return spawn('gulp', ['bench:' + name], {
        stdio: 'inherit'
      })
    }

    function sequence (steps) {
      function next () {
        const step = steps.shift()
        const v = step()
        if (steps.length) {
          v.on('close', next)
        }
        return v
      }
      return next()
    }

    gulp.watch([ task.lib.replace(/^dist/, 'lib') ], [
      'build:' + name
    ])

    gulp.watch([ task.lib ], function () {
      const steps = []
      if (task.test) steps.push(coverage)
      if (shouldBench) steps.push(bench)
      return sequence(steps)
    })

    if (task.test) {
      gulp.watch([ task.test ], coverage)
    }

    if (shouldBench) {
      gulp.watch([ task.bench ], bench)
    }
  })
})

// Set default task to run the watcher
gulp.task('default', [
  'watch'
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
  }).once('error', function (e) {
    console.error(e.stack)
    process.exit(1)
  })
}

function makeBuildTask (name, files) {
  const p = files.replace(/^dist/, 'lib')
  let d = files.slice(0, files.length - path.basename(files).length - 1)
  if (d === 'dist/**') d = 'dist'
  gulp.task(name, ['dist/probes'], function () {
    return gulp.src(p)
      .pipe(babel({
        presets: ['es2015-minus-generators']
      }))
      .pipe(gulp.dest(d))
  })
}

function makeBenchTask (name, files) {
  gulp.task(name, function (done) {
    const helper = require('./test/helper')

    const ao = helper.ao
    ao.sampleRate = ao.addon.MAX_SAMPLE_RATE
    ao.sampleMode = 'always'

    global.appoptics = helper.appoptics(function () {
      gulp.src(files, {
        read: false
      })
        .pipe(matcha())
        .once('end', process.exit)
    })
    // process.exit above exits but eslint like done to be used
    done()
  })
}

function makeTestTask (name, files) {
  gulp.task(name, ['build'], function () {
    return gulp.src(files, {
      read: false
    })
      .pipe(tester())
      .once('end', process.exit)
  })
}

function makeCoverageTask (name, files, libs) {
  libs = libs || 'dist/**/*.js'

  gulp.task('pre-' + name, ['build'], function () {
    return gulp.src(libs)
      .pipe(istanbul())
      .pipe(istanbul.hookRequire())
  })

  gulp.task(name, ['pre-' + name], function () {
    return gulp.src(files)
      .pipe(tester())
      .pipe(istanbul.writeReports({
        dir: './coverage/' + name
      }))
      .pipe(istanbul.enforceThresholds({
        // TODO: 70% is kind of...bad.
        thresholds: { global: 70 }
      }))
      .once('end', process.exit)
  })
}

function makeMatrixTask (name) {
  gulp.task('support-matrix:' + name, function () {
    return spawn('alltheversions', [
      '--module', name,
      '--verbose'
    ], {
      stdio: 'inherit'
    })
  })
}
