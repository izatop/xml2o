import * as SAX from 'sax';

const text = Symbol();

export class Node extends Array {
    readonly name: string;
    readonly local: string;
    readonly prefix: string;
    readonly uri: string;

    readonly attributes: {[key: string]: Attribute};

    constructor(opt: SAX.QualifiedTag, public parent: Node | null) {
        super();
        this.prefix = opt.prefix;
        this.local = opt.local;
        this.name = opt.name;
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
                .map(key => ({[key]: this.attributes[key].value}))
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

    query(name: string, uri?: string): Node[] {
        const result = [];
        for (const node of this) {
            if (node.name === name) {
                result.push(node);
            }

            result.push(...node.query(name));
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
