## Install

Just run `npm i -S xml2o`

## Usage

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

### Node

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
const [list] = node.query('list');
console.log(...list);

```

#### Node Properties

| Property | Description |
|---|---|
| `name`         | Tag name
| `local`        | Tag local name
| `prefix`       | Tag prefix
| `attributes`  |  don't use if you don't known what you do | 
| `parent`      |  Parent Node
| `root`        |  Root Node

#### Node Methods

| Method | Arguments | Description |
|---|---|---|
| `getAttribute`    | `name, uri?`  | Returns an attribute value
| `getAttributeNode`| `name, uri?`  | Returns an attribute
| `getAttributes`   |               | Returns an array of attributes values
| `hasAttribute`    | `name, uri?`  | Returns true if an attribute is exists 
| `query`           | `name, uri?`  | Returns matched nodes in any level

## Note
Code examples written in ES6 and modules so you may need babel, typescript or other.
However you can code in ES3 with standard `requere` but promises required anyway.

## License
MIT
