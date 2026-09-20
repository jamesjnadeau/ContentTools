/* Builds the dev playground (the former sandbox). Order and inputs recovered
   from the deleted Gruntfile.coffee (coffee.sandbox / sass.sandbox).
   Note cloudinary-image-uploader is deliberately excluded -- upstream never
   compiled it either; it is reference material for a real uploader. */
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Concatenated in one scope, as the CoffeeScript build did.
const parts = ['image-uploader', 'playground']
    .map(n => readFileSync(join(ROOT, 'src/playground', `${n}.js`), 'utf8'));
writeFileSync(join(ROOT, 'playground/playground.js'),
              `(function() {\n${parts.join('\n')}\n}).call(this);\n`);

execFileSync('npx', [
    'sass', '--no-source-map', '--quiet', '--style=expanded',
    'src/playground/playground.scss', 'playground/playground.css'
], {cwd: ROOT, stdio: 'inherit'});

console.log('built playground/');
