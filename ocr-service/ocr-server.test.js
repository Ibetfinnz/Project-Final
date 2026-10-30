const test = require("node:test");
const assert = require("node:assert/strict");
const { isSupportedFile } = require("./pdf-image-utils");

test("isSupportedFile accepts PDF and image", () => {
  assert.equal(
    isSupportedFile({ mimetype: "application/pdf", originalname: "document.pdf" }),
    true,
  );
  assert.equal(
    isSupportedFile({ mimetype: "image/png", originalname: "document.png" }),
    true,
  );
});

test("isSupportedFile rejects unrelated files", () => {
  assert.equal(
    isSupportedFile({ mimetype: "text/plain", originalname: "notes.txt" }),
    false,
  );
});
