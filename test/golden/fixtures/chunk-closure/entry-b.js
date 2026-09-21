// Dynamic only. Reachable, but never CHARGED -- this is the lazy-import
// shape that must stay out of an entry's budget.
export const three = () => import("./chunks/three.js");
