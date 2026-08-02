import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import { Attribute, Node, convertStream, convertString } from "../src";

const xml = '<root type="thing"><item id="1">one</item><item id="2"><![CDATA[two]]></item></root>';

describe("conversion", () => {
    test("converts strings", async () => {
        const node = await convertString(xml);
        expect(node).toBeInstanceOf(Node);
        expect(node.query("item")).toHaveLength(2);
        expect(node.query("item")[0]?.getAttributeNode("id")).toBeInstanceOf(Attribute);
    });

    test("converts readable streams", async () => {
        const node = await convertStream(Readable.from([xml]));
        expect(node.getAttribute("type")).toBe("thing");
        expect(node.text).toContain("onetwo");
    });
});
