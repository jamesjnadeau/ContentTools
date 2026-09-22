// Reached only through entry-mixed.js's dynamic import, and it pulls in
// two more: one the static side already has, one it does not.
import {two} from "./two.js";
import {five} from "./five.js";
export const four = two + five;
