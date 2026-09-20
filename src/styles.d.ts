/* Vite's `?inline` query returns a stylesheet's compiled text as a string
   rather than injecting it. tsc knows nothing about the query, so declare it. */
declare module '*.scss?inline' {
    const css: string;
    export default css;
}
