/* Evaluation order is load-bearing: each file declares classes against
 * the ContentEdit object at module-evaluation time, so a subclass's file must
 * run after its base's. Order recorded from the upstream Gruntfile. */
import './namespace.js';
import './tag-names.js';
import './bases.js';
import './regions.js';
import './fixtures.js';
import './root.js';
import './static.js';
import './text.js';
import './images.js';
import './videos.js';
import './lists.js';
import './tables.js';

export {default} from './namespace.js';
