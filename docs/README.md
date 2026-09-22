# Documentation

- **[Migrating from 1.6.x](migrating-from-1.6.md)** — what is unchanged (nearly all of it), the
  renamed files and package, and the handful of things that genuinely differ.
- **[`<content-tools-editor>`](element.md)** — the custom element: attributes, properties,
  methods and the DOM event contract.
- **[Markdown mode](markdown-mode.md)** — constraining the editor to what markdown can express,
  and the byte-preserving save that turns an edit into a one-line diff.
- **[The git-backed half](cms.md)** — the runtime config, the GitHub client, and the
  branch-per-entry pull request workflow a save becomes.
- **[The shell](shell.md)** — `<content-tools-cms>`: the application authors open, and
  how a deployment is configured and installed.
- **[The round trip, by hand](round-trip.md)** — the one check no test can make:
  edit an entry from a real repository, submit it, and read the pull request
  GitHub actually received.
- **[Signing in](auth.md)** — the two auth adapters: a fine-grained token for one
  operator, a GitHub App for a site with authors, and the small proxy the second needs.
- **[Content scope: Mode A and Mode B](content-scope.md)** — where the editable content lives,
  and why the default leaves it in the light DOM.
- **[`RootContext` — the host seam](root-context.md)** — the single object every `document` and
  `window` access goes through, and how to supply your own.

The v1.6.x API itself is unchanged, so [upstream's
documentation](https://getcontenttools.com/api/content-tools) still describes it accurately.
