var gulp = require('gulp');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');

gulp.task('default', ['compress']);

gulp.task('compress', function() {
	return gulp.src(['src/remote.js'])
		.pipe(uglify({ mangle: false }))
		.pipe(rename('remote.min.js'))
		.pipe(gulp.dest('dist'));
});
