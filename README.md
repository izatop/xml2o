# xml2o

Helps you convert XML into an object for easy reading.

## Getting Started

Install the package:

```bash
npm i -S xml2o
```

Let's convert XML from stream:

```typescript
import {convertStream} from 'xml2o';
import {createReadStream} from 'fs';

const node = convertStream(createReadStream('/path/to/file.xml'));
```

We can doing same with string:

```typescript
import {convertString} from 'xml2o';

const node = convertString('<node><foo bar="bar">foo</foo></node>');
```

## Examples

A SimpleXML-like Node object made to help you read XML structures in JS without DOM.

**Check a node**

```typescript
import {convertString} from 'xml2o';

const xml = `<node>
    <foo bar="bar">foo</foo>
    <list>
        <baz id="1" name="baz 1" />
        <baz id="2" name="baz 2" />
        <baz id="3" name="baz 3" />
    </list>
</node>`;

const node = convertString(xml);
console.log(node);
```

**Root of a node, name and inner text**

```typescript
console.log(
    node.name,
    node.text
);
```

**Child node name, text and attributes**

```typescript
console.log(
    node[0].name,
    node[0].text,
    node[0].getAttribute('bar'),
    node[0].getAttributeNode('bar'),
    node[0].getAttributes()
)
```

**Node children**
```typescript
console.log(...node.map(child => child.name));
```

**Node query**
```typescript
import {convertString} from 'xml2o';

const xml = `<node>
    <a/>
    <b>
        <a/>
        <a/>
        <c><a/></c>
    </b>
    <d>
        <c><a/></c>
    </d>
</node>`;

const node = convertString(xml);
console.log(node.query('/a')); // found /node/a
console.log(node.query('a')); // found /node/a, /node/b/a, /node/b/c/a, /node/d/c/a
console.log(node.query('c/a')); // found /node/b/c/a, /node/d/c/a
console.log(node.query('/d/c')); // found /node/d/c
console.log(node.query('b/a')); // found /node/b/a
```

## Documentation

| Method | Arguments | Return | Description |
|---|---|---|---|
| convertString | `XMLString` | `Node` | XML string
| convertStream | `stream`    | `Node` | Readable stream

### Node

Node class used to present XML nodes as objects. Every Node object has following properties and methods:

**Properties**

| Property | Description |
|---|---|
| `name`         | Tag name
| `local`        | Tag local name
| `prefix`       | Tag prefix
| `parent`       | Parent Node
| `root`         | Root Node

**Methods**

| Method | Arguments | Return | Description |
|---|---|---|---|
| `getAttribute`    | `name, uri?` | `string`           | Returns an attribute value
| `getAttributeNode`| `name, uri?` | `Attribute`        | Returns an attribute
| `getAttributes`   |              | `Array<string>`    | Returns an array of attributes values
| `hasAttribute`    | `name, uri?` | `boolean`          | Returns true if an attribute is exists 
| `query`           | `name, uri?` | `Array<Node>`      | Returns matched nodes in any level

# Note
Code examples written with modules so you may need babel, typescript or other to run its or rewrite ES6 imports to: 

```js
const createString = require('xml2o').createString;
```

This library written in ES6 and if you need ES3 build you can tell me i'll make support for older JS versions. 

# License
MIT
