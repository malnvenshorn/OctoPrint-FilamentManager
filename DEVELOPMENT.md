# Development environment
All files in the `octoprint_filamentmanager/static/{css,js}` directory will be build with [Gulp](https://gulpjs.com/), from the source files in `static/{css,js}`, and not modified directly. The build process includes:
- Static code analysis with [ESLint](https://eslint.org/)
- Transcompiling to ES5 with [Babel](https://babeljs.io/)
- Concatinating all JS files into one file `filamentmanager.bundled.js`
- Concatinating and minifying all CSS files into one file `filamentmanager.min.css`


## Prerequisites
1. Install [NodeJS](http://www.nodejs.org/) and [NPM](https://www.npmjs.com/) with your package manager

1. Install development dependencies with `npm install --dev`


## Build
1. Check the source code with `npx gulp lint`

1. Start the build process with `npx gulp build`
