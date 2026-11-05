import test from "node:test";
import assert from "node:assert/strict";
import { validGLB, safeContent } from "../routes/content.js";

function glb(document, binary) {
  const json = Buffer.from(
    typeof document === "string" ? document : JSON.stringify(document),
  );
  const padded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
  ]);
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(
    20 + padded.length + (binary ? binary.length + 8 : 0),
    8,
  );
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  if (!binary) return Buffer.concat([header, padded]);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binaryHeader, binary]);
}
const asset = { version: "2.0" };

test("GLB uploads validate chunks and self-contained resources", () => {
  assert.equal(validGLB(glb({ asset })), true);
  assert.equal(
    validGLB(
      glb({
        asset,
        buffers: [
          {
            byteLength: 4,
            uri: "data:application/octet-stream;base64,AQIDBA==",
          },
        ],
      }),
    ),
    true,
  );
  const document = {
    asset,
    buffers: [{ byteLength: 3 }],
    bufferViews: [{ buffer: 0, byteLength: 3 }],
    images: [{ bufferView: 0, mimeType: "image/png" }],
  };
  assert.equal(validGLB(glb(document, Buffer.from([1, 2, 3, 0]))), true);
  assert.equal(
    validGLB(glb(document)),
    false,
    "embedded buffer needs a binary chunk",
  );
  assert.equal(
    validGLB(glb(document, Buffer.from([1, 2, 3, 4]))),
    false,
    "binary padding must be zero",
  );
  assert.equal(
    validGLB(
      glb(
        { ...document, bufferViews: [{ buffer: 0, byteLength: 10 }] },
        Buffer.from([1, 2, 3, 0]),
      ),
    ),
    false,
  );
  assert.equal(
    validGLB(
      glb({
        asset,
        buffers: [{ byteLength: 4, uri: "https://external.invalid/private" }],
      }),
    ),
    false,
  );
  assert.equal(
    validGLB(glb({ asset, images: [{ uri: "../private.png" }] })),
    false,
  );
  assert.equal(
    validGLB(
      glb({
        asset,
        extensions: { resource: { uri: "https://external.invalid/model.bin" } },
      }),
    ),
    false,
  );
  assert.equal(
    validGLB(
      glb({ asset, images: [{ uri: "data:image/svg+xml;base64,PHN2Zz4=" }] }),
    ),
    false,
  );
  assert.equal(validGLB(glb({ asset: { version: "1.0" } })), false);
  assert.equal(validGLB(glb("{broken}")), false);
  const truncated = glb({ asset }).subarray(0, 20);
  assert.equal(validGLB(truncated), false);
  const fakeHeader = Buffer.alloc(12);
  fakeHeader.write("glTF");
  fakeHeader.writeUInt32LE(2, 4);
  fakeHeader.writeUInt32LE(12, 8);
  assert.equal(validGLB(fakeHeader), false);
});

test("legacy URL sanitization rejects active schemes while preserving safe resources", () => {
  const row = safeContent({
    modelo_url: "javascript:alert(1)",
    imagen_url: "https://example.invalid/image.png",
    libro_url: "data:text/html,unsafe",
    nombre: "a normal title",
  });
  assert.equal(row.modelo_url, null);
  assert.equal(row.libro_url, null);
  assert.equal(row.imagen_url, "https://example.invalid/image.png");
  assert.equal(row.nombre, "a normal title");
});
