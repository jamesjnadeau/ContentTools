import type {HTMLStringNamespace} from '../../src/core/namespaces.js';

// The literal below is deliberately incomplete: sibling modules attach the
// classes as they load. The assertion states that contract, which is what
// lets every other module see the full member list.
const HTMLString = {} as unknown as HTMLStringNamespace;

export default HTMLString;
