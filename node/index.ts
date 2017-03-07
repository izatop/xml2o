import * as SAX from 'sax';

const text = Symbol();

export class Node extends Array {
    public readonly name: string;
    public readonly local: string;
    public readonly path: string;
    public readonly prefix: string;
    public readonly uri: string;

    protected readonly attributes: {[key: string]: Attribute};

    constructor(opt: SAX.QualifiedTag, public parent: Node | null) {
        super();
        this.name = opt.name;
        this.local = opt.local;
        this.prefix = opt.prefix;
        this.uri = opt.uri || '';

        this.attributes = Object.assign({}, ...Object.keys(opt.attributes).map(key => ({[key]: new Attribute(opt.attributes[key])})));
        this[text] = [];
    }

    static pushText(node, value) {
        node[text].push(value);
        if (node.parent) {
            node.parent[text].push(value);
        }
    }

    static addNode(parent, opt: SAX.QualifiedTag) {
        const node = new Node(opt, parent);
        parent.push(node);
        return node;
    }

    getAttributes(uri?: string) {
        return Object.assign({},
            ...Object.keys(this.attributes)
                .filter(key => {
                    const attribute = this.attributes[key];
                    return (uri && attribute.uri === uri) || (!uri && !attribute.uri)
                })
                .map(key => ({[this.attributes[key].local]: this.attributes[key].value}))
        )
    }

    getAttribute(name: string, uri?: string): string {
        return (this.getAttributeNode(name, uri) || {value: undefined}).value;
    }

    getAttributeNode(name: string, uri?: string): Attribute {
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

    hasAttribute(name: string, uri?: string): boolean {
        return !!this.getAttributeNode(name, uri);
    }

    get root() {
        return this.parent ? this.parent.root : this;
    }

    get text() {
        return this[text].join('');
    }

    query(path: string, uri?: string): Node[] {
        const result = [];
        const searchUri = uri || '';
        let match: {(node: Node): Node[]};

        if (path === '/') {
            return [this];
        }

        if (0 === path.indexOf('/')) {
            const parts = path.split('/').slice(1);
            if (parts.length === 1) {
                match = (node) => parts[0] === node.local && searchUri === node.uri ? [node] : [];
            } else if (parts.length > 1) {
                match = (node) => parts[0] === node.local ? [...node.query('/'.concat(parts.slice(1).join('/')), uri)] : [];
            } else {
                return [];
            }
        } else if (-1 !== path.indexOf('/')) {
            const parts = path.split('/');
            match = (node) => parts[0] === node.local ? [...node.query(parts.slice(1).join('/'), uri)] : [...node.query(path, uri)];
        } else {
            match = (node) => path === node.local && searchUri === node.uri ? [node, ...node.query(path, uri)] : [...node.query(path, uri)];
        }

        for (const node of this) {
            result.push(...match(node));
        }

        return result;
    }
}


export class Attribute {
    readonly name: string;
    readonly local: string;
    readonly value: string;
    readonly prefix: string;
    readonly uri: string;

    constructor(opt: SAX.QualifiedAttribute) {
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
