import {describe, expect, test} from "bun:test";
import {Attribute, convertString, Node} from "../src";

const xml = [
    '<root type="thing" xmlns:test="urn:test" test:language="en">',
    '<group><item id="1">one</item><item id="2">two</item></group>',
    '<test:item id="3" test:code="three">namespaced</test:item>',
    '</root>',
].join("");

describe("nodes", () => {
    test("queries paths and namespaces", async () => {
        const node = await convertString(xml);

        expect(node).toBeInstanceOf(Node);
        expect(node.query("/")).toEqual([node]);
        expect(node.query("/group/item")).toHaveLength(2);
        expect(node.query("group/item")).toHaveLength(2);
        expect(node.query("item")).toHaveLength(2);
        expect(node.query("missing")).toEqual([]);
        expect(node.query("item", "urn:test")).toHaveLength(1);
        expect(node.query("item")[0]?.root).toBe(node);
        expect(node.query("item")[0]?.text).toBe("one");
    });

    test("reads attributes with and without namespaces", async () => {
        const node = await convertString(xml);
        const item = node.query("item")[0]!;
        const namespacedItem = node.query("item", "urn:test")[0]!;
        const id = item.getAttributeNode("id");

        expect(node.getAttributes()).toEqual({type: "thing"});
        expect(node.getAttributes("urn:test")).toEqual({language: "en"});
        expect(node.getAttribute("missing")).toBeUndefined();
        expect(item.getAttribute("id")).toBe("1");
        expect(namespacedItem.getAttribute("code", "urn:test")).toBe("three");
        expect(id).toBeInstanceOf(Attribute);
        expect(id?.toString()).toBe("1");
        expect(item.hasAttribute("id")).toBe(true);
        expect(item.hasAttribute("missing")).toBe(false);
        expect(namespacedItem.hasAttribute("code", "urn:test")).toBe(true);
    });
});
