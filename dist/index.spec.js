"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const fs_1 = require("fs");
const index_1 = require("./index");
const test = require("tape");
const index_2 = require("./node/index");
const testXMLFile = (0, path_1.join)(__dirname, './index.spec.xml');
const trim = (t) => t.replace(/(^\s*|\s*$)/g, '');
test('Convert string', (assert) => __awaiter(void 0, void 0, void 0, function* () {
    assert.plan(3);
    const node = yield (0, index_1.convertString)((0, fs_1.readFileSync)(testXMLFile, 'utf-8'));
    assert.ok(node instanceof index_2.Node);
    assert.ok(node[0] instanceof index_2.Node);
    assert.equal(node.length, 5);
}));
test('Convert stream', (assert) => __awaiter(void 0, void 0, void 0, function* () {
    assert.plan(3);
    const node = yield (0, index_1.convertStream)((0, fs_1.createReadStream)(testXMLFile));
    assert.ok(node instanceof index_2.Node);
    assert.ok(node[0] instanceof index_2.Node);
    assert.equal(node.length, 5);
}));
test('Query', (assert) => __awaiter(void 0, void 0, void 0, function* () {
    assert.plan(8);
    const node = yield (0, index_1.convertStream)((0, fs_1.createReadStream)(testXMLFile));
    assert.equal(node.query('Foo').length, 3);
    assert.equal(node.query('ListTest')[0].query('Foo').length, 3);
    assert.equal(node.query('/QueryTest').length, 1);
    assert.equal(node.query('/QueryTest/A').length, 2);
    assert.equal(node.query('/Unknown').length, 0);
    assert.equal(node.query('B/A').length, 1);
    assert.equal(node.query('B/C').length, 2);
    assert.equal(node.query('A').length, 3);
}));
test('Text', (assert) => __awaiter(void 0, void 0, void 0, function* () {
    assert.plan(2);
    const node = yield (0, index_1.convertStream)((0, fs_1.createReadStream)(testXMLFile));
    assert.equal(trim(node.query('TextNodeTest')[0].text), 'Hello, Bob!');
    assert.equal(trim(node.query('TextNodeInnerTest')[0].text), 'Hello, inner Bob!');
}));
test('Attributes', (assert) => __awaiter(void 0, void 0, void 0, function* () {
    assert.plan(5);
    const node = yield (0, index_1.convertStream)((0, fs_1.createReadStream)(testXMLFile));
    assert.ok(node.query('Foo')[0].getAttributeNode('id') instanceof index_2.Attribute);
    assert.equal(node.query('Foo')[0].getAttribute('id'), "1");
    assert.equal(node.query('Foo')[1].getAttribute('id'), "2");
    assert.equal(node.query('Foo')[2].getAttribute('id'), "3");
    assert.same(node.getAttributes(), { type: 'thing', bool: 'true' });
}));
//# sourceMappingURL=index.spec.js.map