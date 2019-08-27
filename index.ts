import * as SAX from 'sax';
import {Node, Attribute} from './node';
import ReadableStream = NodeJS.ReadableStream;

interface CompatEvents {
    on(event: 'error', fn: (error: Error) => void): void;
    on(event: 'text', fn: (text: string) => void): void;
    on(event: 'doctype', fn: (doctype: string) => void): void;
    on(event: 'processinginstruction', fn: (processinginstruction: string) => void): void;
    on(event: 'sgmldeclaration', fn: (sgmldeclaration: string) => void): void;
    on(event: 'opentagstart', fn: (node: SAX.QualifiedTag) => void): void;
    on(event: 'opentag', fn: (node: SAX.QualifiedTag) => void): void;
    on(event: 'closetag', fn: (node: SAX.QualifiedTag) => void): void;
    on(event: 'attribute', fn: (attribute: SAX.QualifiedAttribute) => void): void;
    on(event: 'comment', fn: (comment: string) => void): void;
    on(event: 'opencdata', fn: (start: string) => void): void;
    on(event: 'cdata', fn: (cdata: string) => void): void;
    on(event: 'closecdata', fn: (end: string) => void): void;
    on(event: 'opennamespace', fn: (ns: string) => void): void;
    on(event: 'end', fn: () => void): void;
    on(event: 'ready', fn: () => void): void;
    on(event: 'noscript', fn: () => void): void;
}

function convert(parser: CompatEvents, ready: () => void): Promise<Node> {
    let pointer: Node | any;

    parser.on('opentag', node => {
        if (!pointer) {
            pointer = new Node(node, null);
        } else {
            pointer = Node.addNode(pointer, node);
        }
    });

    parser.on('closetag', node => pointer.parent ? pointer = pointer.parent : null);
    parser.on('text', value => pointer && Node.pushText(pointer, value));
    parser.on('cdata', value => Node.pushText(pointer, value));

    return new Promise((resolve, reject) => {
        parser.on('end', () => resolve(pointer));
        parser.on('error', error => reject(error));
        ready();
    });
}

export function convertStream(stream: ReadableStream): Promise<Node> {
    const parser = SAX.createStream(true, {xmlns: true});
    return convert(parser, () => stream.pipe(parser));
}

export function convertString(XMLString: string): Promise<Node> {
    const parser = SAX.createStream(true, {xmlns: true});
    return convert(parser, () => parser.end(XMLString));
}

export {
    Node,
    Attribute
};
