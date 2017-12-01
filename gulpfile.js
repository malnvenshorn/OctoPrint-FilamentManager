var gulp = require('gulp');
var concat = require('gulp-concat');
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
		.pipe(gulp.dest('octoprint_filamentmanager/static/js/'));
});
