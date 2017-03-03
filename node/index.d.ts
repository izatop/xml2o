import * as SAX from 'sax';
export declare class Node extends Array {
    parent: Node | null;
    readonly name: string;
    readonly local: string;
    readonly path: string;
    readonly prefix: string;
    readonly uri: string;
    protected readonly attributes: {
        [key: string]: Attribute;
    };
    constructor(opt: SAX.QualifiedTag, parent: Node | null);
    static pushText(node: any, value: any): void;
    static addNode(parent: any, opt: SAX.QualifiedTag): Node;
    getAttributes(uri?: string): any;
    getAttribute(name: string, uri?: string): string;
    getAttributeNode(name: string, uri?: string): Attribute;
    hasAttribute(name: string, uri?: string): boolean;
    readonly root: any;
    readonly text: any;
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
