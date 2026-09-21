Fixtures for `scripts/chunk-closure.mjs`.

Hand-written to look like Rollup output, because the thing under test is a
regex over generated JavaScript and the real `dist/` cannot be made to
contain the cases that matter -- a chunk nobody reaches, an import of a file
that is not there -- without breaking the build.
