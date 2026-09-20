/* Builds the dev playground (the former sandbox). Order and inputs recovered
   from the deleted Gruntfile.coffee (coffee.sandbox / sass.sandbox).
   Note cloudinary-image-uploader.coffee is deliberately excluded -- upstream
   never compiled it either; it is reference material for a real uploader. */
import {execFileSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require_ = createRequire(import.meta.url);
const coffeeBin = join(dirname(require_.resolve('coffee-script/package.json')), 'bin/coffee');

execFileSync(process.execPath, [
    coffeeBin, '--join', join(ROOT, 'playground/playground.js'), '--compile',
    join(ROOT, 'src/playground/image-uploader.coffee'),
    join(ROOT, 'src/playground/playground.coffee')
], {cwd: ROOT, stdio: 'inherit'});

execFileSync('npx', [
    'sass', '--no-source-map', '--quiet', '--style=expanded',
    'src/playground/playground.scss', 'playground/playground.css'
], {cwd: ROOT, stdio: 'inherit'});

console.log('built playground/');
