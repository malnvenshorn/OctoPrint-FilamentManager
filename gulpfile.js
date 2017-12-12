var gulp = require('gulp');
var concat = require('gulp-concat');
var eslint = require('gulp-eslint');
var babel = require('gulp-babel');
let cleanCSS = require('gulp-clean-css');

gulp.task('lint', () => {
    return gulp.src(['static/js/**/*.js'])
        .pipe(eslint())
        .pipe(eslint.format());
});

gulp.task('build', ['js', 'css'])

gulp.task('js', () => {
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

gulp.task('css', () => {
    return gulp.src([
        'static/css/*.css',
    ])
    .pipe(concat('filamentmanager.min.css'))
    .pipe(cleanCSS())
    .pipe(gulp.dest('octoprint_filamentmanager/static/css/'));
});
