/* Evaluation order is load-bearing: each file declares classes against
 * the ContentTools object at module-evaluation time, so a subclass's file must
 * run after its base's. Order recorded from the upstream Gruntfile. */
import './namespace.js';
import './ui/ui.js';
import './ui/events.js';
import './ui/flashes.js';
import './ui/ignition.js';
import './ui/inspector.js';
import './ui/modal.js';
import './ui/toolbox.js';
import './ui/dialogs/dialogs.js';
import './ui/dialogs/image.js';
import './ui/dialogs/link.js';
import './ui/dialogs/properties.js';
import './ui/dialogs/table.js';
import './ui/dialogs/video.js';
import './clean-html.js';
import './editor.js';
import './history.js';
import './styles.js';
import './tools.js';

export {default} from './namespace.js';
