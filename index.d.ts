/// <reference types="node" />
import { Node } from './node';
import ReadableStream = NodeJS.ReadableStream;
export declare function convertStream(stream: ReadableStream): Promise<Node>;
export declare function convertString(XMLString: string): Promise<Node>;
