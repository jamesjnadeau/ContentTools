# `build/` is frozen

`build/content-tools.js` and `build/content-tools.min.*` are the **v1.6.16**
artifacts. They are kept, unchanged, as the reference the 2.0 modernization is
verified against: `test/golden/legacy-bundle.js` is a copy of the former, and CI
diffs every new build against it.

Builds now go to `dist/` (gitignored) via `npm run build`.

The binary assets that used to live in `build/images/` moved to `src/assets/` --
they existed nowhere else in the tree, so they had to leave before `build/`
could stop being the source of truth. `git tag v1.6.16-legacy` marks the last
pristine commit.
