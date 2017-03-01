import * as SAX from 'sax';
import {Stream} from 'stream';
import {Node} from './node';
import ReadableStream = NodeJS.ReadableStream;

interface CompatEvents {
    on(event: 'error', fn: (error: Error) => void);
    on(event: 'text', fn: (text: string) => void);
    on(event: 'doctype', fn: (doctype: string) => void);
    on(event: 'processinginstruction', fn: (processinginstruction: string) => void);
    on(event: 'sgmldeclaration', fn: (sgmldeclaration: string) => void);
    on(event: 'opentagstart', fn: (node: SAX.QualifiedTag) => void);
    on(event: 'opentag', fn: (node: SAX.QualifiedTag) => void);
    on(event: 'closetag', fn: (node: SAX.QualifiedTag) => void);
    on(event: 'attribute', fn: (attribute: SAX.QualifiedAttribute) => void);
    on(event: 'comment', fn: (comment: string) => void);
    on(event: 'opencdata', fn: (start: string) => void);
    on(event: 'cdata', fn: (cdata: string) => void);
    on(event: 'closecdata', fn: (end: string) => void);
    on(event: 'opennamespace', fn: (ns: string) => void);
    on(event: 'end', fn: () => void);
    on(event: 'ready', fn: () => void);
    on(event: 'noscript', fn: () => void);
}

function convert(parser: CompatEvents, ready: () => void): Promise<Node> {
    let pointer: Node = null;

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
