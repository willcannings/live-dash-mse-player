'use strict';

// Include Gulp & Tools We'll Use
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var del = require('del');
var browserSync = require('browser-sync');
var reload = browserSync.reload;
var compass = require('gulp-compass');
var path = require('path');
var url = require('url');
var spawn = require('child_process').spawn;
var fs = require('fs');

// -------------------------------------------
// development
// -------------------------------------------
// use compass watch to only compile files when necessary
gulp.task('dev:styles', function () {
  var options = ['watch',
    process.cwd(),
    '--relative-assets',
    '--output-style',
    'nested',
    '--css-dir',
    '.tmp',
    '--sass-dir',
    'demo',
    '--boring',
    '--import-path',
    'bower_components'
  ];

  var child = spawn('compass', options, process.cwd());
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', function (data) {
    console.log(data);
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', function (data) {
    console.log(data);
  });
});

// Watch Files For Changes & Reload
gulp.task('browser-sync', function () {
  var baseDirs = ['src', '.tmp', 'demo', 'bower_components'];
  var indexPath = path.join(__dirname, 'demo', 'player.html');

  browserSync.init(['.tmp/**/*.css', 'demo/**/*.js'], {
    notify: false,
    port: 7000,
    open: false,
    host: '0.0.0.0',
    server: {
      baseDir: baseDirs,
      index: 'present.html',
    }
  });

  gulp.watch(['demo/**/*.html'], reload);
  gulp.watch([
    'demo/images/*.png',
    'demo/images/*.jpg',
    'demo/images/*.svg',
    'demo/images/*.gif'
  ], [reload]);
});

gulp.task('serve', ['dev:styles', 'browser-sync']);


// -------------------------------------------
// production
// -------------------------------------------
// Clean Output Directory
gulp.task('clean', del.bind(null, ['.tmp', 'dist']));
