var gulp = require('gulp'),
    gutil = require('gulp-util'),
    concat = require('gulp-concat'),
    ts = require('gulp-typescript'),
    merge = require('merge2'),
    strip = require('gulp-strip-comments');

gulp.task('default', function(){
    var tsResult = gulp.src(['src/main/**.ts', 'src/dependent_definitions/**.ts', 'node_modules/MFCAuto/lib/**.ts'])
        .pipe(ts({
            removeComments: false,
            module: 'commonjs',
            noImplicitAny: true,
            target: 'ES5',
            declarationFiles: true,
            noExternalResolve: true,
            sortOutput: true
        }));
    var jsResult = gulp.src('src/main/*.js');

    return merge([tsResult.dts.pipe(concat('PushMFC.d.ts')).pipe(strip()).pipe(gulp.dest('lib')),
        tsResult.js.pipe(concat('PushMFC.js')).pipe(gulp.dest('lib')),
        jsResult.pipe(gulp.dest('lib'))]);
});

gulp.task('watch', function() {
    gulp.watch('src/main/*', ['default']);
});
