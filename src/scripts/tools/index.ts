/* Barrel for the tool modules.
 *
 * Order is load-bearing, exactly as it was inside the original single
 * file: ToolShelf and the Tool base class must evaluate before any tool,
 * because each tool registers itself with ToolShelf.stow() as a side
 * effect of its class body.
 *
 * Those registrations are also why this whole directory is in the
 * package sideEffects list -- a bundler that decides these modules are
 * unused drops them with no build error, and ToolShelf.fetch() then
 * throws at runtime. The surface test pins the count at 21.
 */
import './tool-shelf.js';
import './tool.js';
import './bold.js';
import './italic.js';
import './link.js';
import './heading.js';
import './subheading.js';
import './paragraph.js';
import './preformatted.js';
import './align-left.js';
import './align-center.js';
import './align-right.js';
import './unordered-list.js';
import './ordered-list.js';
import './table.js';
import './indent.js';
import './unindent.js';
import './line-break.js';
import './image.js';
import './video.js';
import './undo.js';
import './redo.js';
import './remove.js';
