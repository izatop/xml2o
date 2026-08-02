# xml2o

Convert XML into lightweight, queryable JavaScript objects without a DOM.

## Installation

Install `xml2o` with your package manager:

```bash
npm install xml2o
```

```bash
bun add xml2o
```

```bash
yarn add xml2o
```

## Usage

`convertString` and `convertStream` parse asynchronously and return a
`Promise<Node>`.

### ESM

```typescript
import { convertString } from "xml2o";

const root = await convertString('<root><item id="1">value</item></root>');
console.log(root.query("item")[0]?.text); // value
```

### CommonJS

```javascript
const { convertString } = require("xml2o");

async function readXml() {
    const root = await convertString('<root><item id="1">value</item></root>');
    console.log(root.query("item")[0]?.getAttribute("id")); // 1
}

readXml();
```

### Streams

Pass a Node.js readable stream to `convertStream`:

```typescript
import { createReadStream } from "node:fs";
import { convertStream } from "xml2o";

const root = await convertStream(createReadStream("/path/to/file.xml"));
```

Invalid XML rejects the returned promise, so handle conversion errors with
`try`/`catch` or `.catch()`:

```typescript
try {
    await convertString("<root><item></root>");
} catch (error) {
    console.error("Could not parse XML", error);
}
```

## API

### `convertString(xml)`

Parses an XML string and resolves to the root `Node`.

### `convertStream(stream)`

Parses a readable stream and resolves to the root `Node`.

### `Node`

A `Node` is an array of its child nodes. It exposes the element's `name`,
`local` name, `prefix`, namespace `uri`, `parent`, and `root`. Its `text`
property concatenates text and CDATA received for the node and its direct child
elements.

Use attribute helpers to read attributes:

```typescript
const item = root.query("item")[0];

item?.getAttribute("id"); // "1"
item?.hasAttribute("id"); // true
item?.getAttributeNode("id"); // Attribute | undefined
item?.getAttributes(); // { id: "1" }
```

`getAttribute`, `getAttributeNode`, and `hasAttribute` accept an optional
namespace URI as their second argument. `getAttributes(uri)` returns attributes
in that namespace; without an argument it returns non-namespaced attributes.

Use `query(path, uri?)` to find child elements by their local name. Paths have
these forms:

| Path            | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| `"item"`        | Find every descendant `item` node.                    |
| `"group/item"`  | Find an `item` below a matching `group` at any depth. |
| `"/group/item"` | Follow the path from the current node.                |
| `"/"`           | Return the current node.                              |

Pass a namespace URI as the second argument to restrict matches:

```typescript
const namespacedItems = root.query("item", "urn:example");
const code = namespacedItems[0]?.getAttribute("code", "urn:example");
```

### `Attribute`

An `Attribute` exposes its `name`, `local` name, `prefix`, namespace `uri`, and
string `value`. Calling `attribute.toString()` returns its value.

## Development

This project uses Bun for development:

```bash
bun install
bun run security
bun test
bun run build
bun run check
```

## License

MIT
