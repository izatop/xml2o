import * as SAX from 'sax';
declare const text: unique symbol;
export declare class Node extends Array {
    parent: Node | null;
    [text]: string[];
    readonly name: string;
    readonly local: string;
    readonly path: string;
    readonly prefix: string;
    readonly uri: string;
    protected readonly attributes: {
        [key: string]: Attribute;
    };
    constructor(opt: SAX.QualifiedTag, parent: Node | null);
    readonly root: Node;
    readonly text: string;
    static pushText(node: Node, value: string): void;
    static addNode(parent: Node, opt: SAX.QualifiedTag): Node;
    getAttributes(uri?: string): any;
    getAttribute(name: string, uri?: string): string | undefined;
    getAttributeNode(name: string, uri?: string): Attribute | undefined;
    hasAttribute(name: string, uri?: string): boolean;
    query(path: string, uri?: string): Node[];
}
export declare class Attribute {
    readonly name: string;
    readonly local: string;
    readonly value: string;
    readonly prefix: string;
    readonly uri: string;
    constructor(opt: SAX.QualifiedAttribute);
    toString(): string;
}
export {};
