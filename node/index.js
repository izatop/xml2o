"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Attribute = exports.Node = void 0;
const text = Symbol();
class Node extends Array {
    constructor(opt, parent) {
        super();
        this.parent = parent;
        this.name = opt.name;
        this.local = opt.local;
        this.prefix = opt.prefix;
        this.uri = opt.uri || '';
        this.attributes = Object.assign({}, ...Object.keys(opt.attributes)
            .map(key => ({ [key]: new Attribute(opt.attributes[key]) })));
        this[text] = [];
    }
    get root() {
        return this.parent ? this.parent.root : this;
    }
    get text() {
        return this[text].join('');
    }
    static pushText(node, value) {
        node[text].push(value);
        if (node.parent) {
            node.parent[text].push(value);
        }
    }
    static addNode(parent, opt) {
        const node = new Node(opt, parent);
        parent.push(node);
        return node;
    }
    getAttributes(uri) {
        return Object.assign({}, ...Object.keys(this.attributes)
            .filter(key => {
            const attribute = this.attributes[key];
            return (uri && attribute.uri === uri) || (!uri && !attribute.uri);
        })
            .map(key => ({ [this.attributes[key].local]: this.attributes[key].value })));
    }
    getAttribute(name, uri) {
        const attribute = (this.getAttributeNode(name, uri) || { value: undefined });
        if (attribute) {
            return attribute.value;
        }
    }
    getAttributeNode(name, uri) {
        return Object.entries(this.attributes)
            .filter(([, attribute]) => {
            if (name && uri) {
                return name === attribute.local
                    && uri === attribute.uri;
            }
            return attribute.name === name;
        })
            .map(([, attribute]) => attribute)
            .shift();
    }
    hasAttribute(name, uri) {
        return !!this.getAttributeNode(name, uri);
    }
    query(path, uri) {
        const result = [];
        const searchUri = uri || '';
        let match;
        if (path === '/') {
            return [this];
        }
        if (0 === path.indexOf('/')) {
            const parts = path.split('/').slice(1);
            if (parts.length === 1) {
                match = (node) => parts[0] === node.local && searchUri === node.uri ? [node] : [];
            }
            else if (parts.length > 1) {
                match = (node) => parts[0] === node.local ? [...node.query('/'.concat(parts.slice(1).join('/')), uri)] : [];
            }
            else {
                return [];
            }
        }
        else if (-1 !== path.indexOf('/')) {
            const parts = path.split('/');
            match = (node) => parts[0] === node.local ? [...node.query(parts.slice(1).join('/'), uri)] : [...node.query(path, uri)];
        }
        else {
            match = (node) => path === node.local && searchUri === node.uri ? [node, ...node.query(path, uri)] : [...node.query(path, uri)];
        }
        for (const node of this) {
            result.push(...match(node));
        }
        return result;
    }
}
exports.Node = Node;
class Attribute {
    constructor(opt) {
        this.value = opt.value;
        this.prefix = opt.prefix;
        this.name = opt.name;
        this.local = opt.local;
        this.uri = opt.uri;
    }
    toString() {
        return this.value;
    }
}
exports.Attribute = Attribute;
//# sourceMappingURL=index.js.map