'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var del = require('del');
var browserSync = require('browser-sync');
var reload = browserSync.reload;
var compass = require('gulp-compass');
var path = require('path');
var spawn = require('child_process').spawn;
var babel = require('gulp-babel');
var sourcemaps = require('gulp-sourcemaps');
var concat = require('gulp-concat');

var paths = {
    html: ['demo/**/*.html'],
    css: '.tmp/**/*.css',
    js: ['src/**/*.js'],
    images: [
        'demo/images/*.png',
        'demo/images/*.jpg',
        'demo/images/*.svg',
        'demo/images/*.gif'
    ]
};


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

// use babel to transpile ES6 > ES5
gulp.task('dev:js', function () {
    return gulp.src(paths.js)
        .pipe(sourcemaps.init())
            .pipe(babel({
                modules: 'ignore',
                optional: 'es7.comprehensions'
            }))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('.tmp'));
});

// watch for changes to html and images and reload
// changes to js will be compiled but won't reload
gulp.task('watch', function() {
    gulp.watch(paths.js, ['dev:js']);
    gulp.watch(paths.html, reload);
    gulp.watch(paths.images, reload);
});

// watch files for changes & reload
gulp.task('browser-sync', function () {
    var baseDirs = ['.tmp', 'demo', 'bower_components', 'node_modules'];
    browserSync.init([paths.css], {
        notify: false,
        port: 7000,
        open: false,
        host: '0.0.0.0',
        server: {
            baseDir: baseDirs,
            index: 'index.html',
        }
    });
});

gulp.task('serve', ['dev:js', 'dev:styles', 'watch', 'browser-sync']);


// -------------------------------------------
// production
// -------------------------------------------
// clean output directory
gulp.task('clean', del.bind(null, ['.tmp', 'dist']));

gulp.task('prod:js', function () {
    return gulp.src(paths.js)
        .pipe(babel({
            modules: 'ignore',
            optional: 'es7.comprehensions'
        }))
        .pipe(gulp.dest('dist'));
});

gulp.task('default', ['prod:js']);
