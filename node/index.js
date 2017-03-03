"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const text = Symbol();
class Node extends Array {
    constructor(opt, parent) {
        super();
        this.parent = parent;
        this.name = opt.name;
        this.local = opt.local;
        this.prefix = opt.prefix;
        this.uri = opt.uri || '';
        this.attributes = Object.assign({}, ...Object.keys(opt.attributes).map(key => ({ [key]: new Attribute(opt.attributes[key]) })));
        this[text] = [];
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
            .map(key => ({ [key]: this.attributes[key].value })));
    }
    getAttribute(name, uri) {
        return (this.getAttributeNode(name, uri) || { value: undefined }).value;
    }
    getAttributeNode(name, uri) {
        return Object.keys(this.attributes)
            .filter(key => {
            const attribute = this.attributes[key];
            if (name && uri) {
                return name === attribute.local
                    && uri === attribute.uri;
            }
            return attribute.name === name;
        })
            .map(key => this.attributes[key])
            .shift();
    }
    hasAttribute(name, uri) {
        return !!this.getAttributeNode(name, uri);
    }
    get root() {
        return this.parent ? this.parent.root : this;
    }
    get text() {
        return this[text].join('');
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