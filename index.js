"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SAX = require("sax");
const node_1 = require("./node");
exports.Node = node_1.Node;
exports.Attribute = node_1.Attribute;
function convert(parser, ready) {
    let pointer;
    parser.on('opentag', node => {
        if (!pointer) {
            pointer = new node_1.Node(node, null);
        }
        else {
            pointer = node_1.Node.addNode(pointer, node);
        }
    });
    parser.on('closetag', node => pointer.parent ? pointer = pointer.parent : null);
    parser.on('text', value => pointer && node_1.Node.pushText(pointer, value));
    parser.on('cdata', value => node_1.Node.pushText(pointer, value));
    return new Promise((resolve, reject) => {
        parser.on('end', () => resolve(pointer));
        parser.on('error', error => reject(error));
        ready();
    });
}
function convertStream(stream) {
    const parser = SAX.createStream(true, { xmlns: true });
    return convert(parser, () => stream.pipe(parser));
}
exports.convertStream = convertStream;
function convertString(XMLString) {
    const parser = SAX.createStream(true, { xmlns: true });
    return convert(parser, () => parser.end(XMLString));
}
exports.convertString = convertString;
//# sourceMappingURL=index.js.map