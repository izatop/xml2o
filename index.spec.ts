import {join} from 'path';
import {createReadStream, readFileSync} from 'fs';
import {convertStream, convertString} from "./index";
import * as test from 'tape';
import {Attribute, Node} from "./node/index";

const testXMLFile = join(__dirname, './index.spec.xml');
const trim = (t: string) => t.replace(/(^\s*|\s*$)/g, '');

test('Convert string', async assert => {
    assert.plan(3);
    const node = await convertString(readFileSync(testXMLFile, 'UTF-8'));
    assert.ok(node instanceof Node);
    assert.ok(node[0] instanceof Node);
    assert.equal(node.length, 5);
});

test('Convert stream', async assert => {
    assert.plan(3);
    const node = await convertStream(createReadStream(testXMLFile));
    assert.ok(node instanceof Node);
    assert.ok(node[0] instanceof Node);
    assert.equal(node.length, 5);
});

test('Query', async assert => {
    assert.plan(8);
    const node = await convertStream(createReadStream(testXMLFile));
    assert.equal(node.query('Foo').length, 3);
    assert.equal(node.query('ListTest')[0].query('Foo').length, 3);
    assert.equal(node.query('/QueryTest').length, 1);
    assert.equal(node.query('/QueryTest/A').length, 2);
    assert.equal(node.query('/Unknown').length, 0);
    assert.equal(node.query('B/A').length, 1);
    assert.equal(node.query('B/C').length, 2);
    assert.equal(node.query('A').length, 3);
});

test('Text', async assert => {
    assert.plan(2);
    const node = await convertStream(createReadStream(testXMLFile));
    assert.equal(trim(node.query('TextNodeTest')[0].text), 'Hello, Bob!');
    assert.equal(trim(node.query('TextNodeInnerTest')[0].text), 'Hello, inner Bob!');
});

test('Attributes', async assert => {
    assert.plan(5);
    const node = await convertStream(createReadStream(testXMLFile));
    assert.ok(node.query('Foo')[0].getAttributeNode('id') instanceof Attribute);
    assert.equal(node.query('Foo')[0].getAttribute('id'), "1");
    assert.equal(node.query('Foo')[1].getAttribute('id'), "2");
    assert.equal(node.query('Foo')[2].getAttribute('id'), "3");
    assert.same(node.getAttributes(), {type: 'thing', bool: 'true'});
});
