/* Installs the document-backed context. Imported for its side effect by the
   entry points, so consumers need not know a context exists. */
import {setRootContext} from './root-context.js';
import DocumentRootContext from './document-root-context.js';

setRootContext(new DocumentRootContext());
