const test = require("node:test");
const assert = require("node:assert/strict");
const { runTyphoonOcr } = require("./typhoon-ocr");

test("Typhoon sends the original images and combines pages in order", async (t) => {
  const pages = [Buffer.from("page-one"), Buffer.from("page-two")];
  const requests = [];
  t.mock.method(global, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(url, `${process.env.OLLAMA_URL || "http://ollama:11434"}/api/chat`);
    assert.equal(body.model, process.env.TYPHOON_OCR_MODEL || "scb10x/typhoon-ocr1.5-3b:latest");
    assert.equal(body.stream, false);
    return { ok: true, json: async () => ({ message: { content: `ข้อความหน้า ${requests.length}` } }) };
  });
  const result = await runTyphoonOcr(pages);
  assert.equal(result.page_count, 2);
  assert.equal(result.text, "--- Page 1 ---\nข้อความหน้า 1\n\n--- Page 2 ---\nข้อความหน้า 2");
  requests.forEach((request, i) => assert.equal(request.messages[0].images[0], pages[i].toString("base64")));
});

test("Typhoon surfaces upstream errors rather than returning empty OCR", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: false, status: 404, text: async () => "model not found" }));
  await assert.rejects(runTyphoonOcr([Buffer.from("image")]), /404: model not found/);
});

test("Typhoon rejects an empty model response", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => ({ message: { content: "  " } }) }));
  await assert.rejects(runTyphoonOcr([Buffer.from("image")]), /returned no OCR text/);
});
