# Install

Just run `npm i -S xml2o`

# Usage

Convert XML from stream:

```typescript
import {convertStream} from 'xml2o';
import {createReadStream} from 'fs';

const node = convertStream(createReadStream('/path/to/file.xml'));
// ...

```

Convert XML from string:

```typescript
import {convertString} from 'xml2o';

const node = convertString('<node><foo bar="bar">foo</foo></node>');
// ...

```

## Node

A node is a SimpleXML-like object which have some properties and methods
to help you read XML structures.

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

### Node Properties

| Property | Description |
|---|---|
| `name`         | Tag name
| `local`        | Tag local name
| `prefix`       | Tag prefix
| `attributes`  |  don't use if you don't known what you do | 
| `parent`      |  Parent Node
| `root`        |  Root Node

### Node Methods

| Method | Arguments | Description |
|---|---|---|
| `getAttribute`    | `name, uri?`  | Returns an attribute value
| `getAttributeNode`| `name, uri?`  | Returns an attribute
| `getAttributes`   |               | Returns an array of attributes values
| `hasAttribute`    | `name, uri?`  | Returns true if an attribute is exists 
| `query`           | `name, uri?`  | Returns matched nodes in any level

# Note
Code examples written with modules so you may need babel, typescript or other to run its or rewrite ES6 imports to: 

```js
const createString = require('xml2o').createString;
```

This library written in ES6 and if you need ES3 build you can tell me i'll make support for older JS versions. 

# License
MIT
