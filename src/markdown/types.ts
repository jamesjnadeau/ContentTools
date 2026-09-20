/**
 * The slice of mdast this package touches.
 *
 * Declared locally rather than depending on `@types/mdast`: the walkers
 * handle a closed set of node types (markdown mode guarantees that), and a
 * structural type over `{type, children, value, position}` says exactly what
 * the code relies on. It also keeps the published `.d.ts` free of a
 * dependency consumers have no other reason to install.
 */

export interface Point {
    line: number;
    column: number;
    offset: number;
}

export interface Position {
    start: Point;
    end: Point;
}

export interface Node {
    type: string;
    position?: Position;
    [key: string]: unknown;
}

export interface Parent extends Node {
    children: Node[];
}

/** A top-level block, paired with the source bytes it came from. */
export interface SourceBlock {
    /** Its index among the document's top-level blocks. Its identity. */
    index: number;
    node: Node;
    /** Byte range in the original source, inclusive-exclusive. */
    start: number;
    end: number;
    /** False for blocks that render as read-only `ContentEdit.Static`. */
    editable: boolean;
}
