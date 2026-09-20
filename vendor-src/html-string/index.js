/* Evaluation order is load-bearing: each file declares classes against
 * the HTMLString object at module-evaluation time, so a subclass's file must
 * run after its base's. Order recorded from the upstream Gruntfile. */
import './fsm.js';
import './namespace.js';
import './strings.js';
import './tags.js';
import './characters.js';

export {default} from './namespace.js';
