/* Vite's `?inline` query returns a stylesheet's compiled text as a string
   rather than injecting it. tsc knows nothing about the query, so declare it. */
declare module '*.scss?inline' {
    const css: string;
    export default css;
}

/* On a binary asset the same query returns a base64 data URI rather than an
   emitted-file path. That is what lets the element carry the icon font's
   bytes and stay drop-in -- see src/element/icon-font.ts. */
declare module '*.woff?inline' {
    const url: string;
    export default url;
}
