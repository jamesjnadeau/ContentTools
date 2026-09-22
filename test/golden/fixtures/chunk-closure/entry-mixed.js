// Both halves, which is `dist/edit.js`'s own shape: a small static body
// and everything else one dynamic hop away. The lazy side reaches
// chunks/two.js, and reaches it STATICALLY -- so a `lazyClosureOf` that
// only collected the directly-imported chunk would under-measure exactly
// the number that says what pressing Edit costs.
import {one} from "./chunks/one.js";
export const later = () => import("./chunks/four.js");
export {one};
