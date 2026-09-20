# Documentation

- **[Migrating from 1.6.x](migrating-from-1.6.md)** — what is unchanged (nearly all of it), the
  renamed files and package, and the handful of things that genuinely differ.
- **[`<content-tools-editor>`](element.md)** — the custom element: attributes, properties,
  methods and the DOM event contract.
- **[Markdown mode](markdown-mode.md)** — constraining the editor to what markdown can express,
  and the byte-preserving save that turns an edit into a one-line diff.
- **[Content scope: Mode A and Mode B](content-scope.md)** — where the editable content lives,
  and why the default leaves it in the light DOM.
- **[`RootContext` — the host seam](root-context.md)** — the single object every `document` and
  `window` access goes through, and how to supply your own.

The v1.6.x API itself is unchanged, so [upstream's
documentation](https://getcontenttools.com/api/content-tools) still describes it accurately.
