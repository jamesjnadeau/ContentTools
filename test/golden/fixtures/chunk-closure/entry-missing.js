// A specifier resolving to nothing. Rollup does not emit these, but the
// walker must not put a file that is not there into a budget.
import {gone} from "./chunks/nope.js";
export {gone};
