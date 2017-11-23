var gulp = require('gulp');
var concat = require('gulp-concat-util');
var eslint = require('gulp-eslint');
var babel = require('gulp-babel');

gulp.task('lint', () => {
    return gulp.src(['static/js/**/*.js'])
        .pipe(eslint())
        .pipe(eslint.format());
});

gulp.task('build', () => {
	return gulp.src([
			'static/js/constructor.js',
            'static/js/**/!(bootstrap)*.js',
            'static/js/bootstrap.js',
		])
        .pipe(babel({
            presets: ['env'],
            plugins: ['transform-remove-strict-mode']
        }))
		.pipe(concat('filamentmanager.bundled.js'))
        .pipe(concat.header('(function() {\n\n"use strict";\n\ntry {\n\n'))
        .pipe(concat.footer('\n} catch (error) {\nconsole.error(error);\n}\n}());\n'))
		.pipe(gulp.dest('octoprint_filamentmanager/static/js/'));
});
