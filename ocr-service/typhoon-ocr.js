const TYPHOON_MODEL =
  process.env.TYPHOON_OCR_MODEL || "scb10x/typhoon-ocr1.5-3b:latest";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";

/**
 * OCR หลักของระบบ (Typhoon OCR)
 * ส่งรูปภาพทีละหน้าไปยังโมเดล vision ใน Ollama
 * โมเดลจะอ่านข้อความและพยายามรักษาโครงสร้างตารางเป็น Markdown/HTML
 */
async function runTyphoonOcr(pageImages) {
  const pageTexts = [];

  for (let index = 0; index < pageImages.length; index += 1) {
    const text = await recognizePage(pageImages[index]);
    pageTexts.push(`--- Page ${index + 1} ---\n${text}`);
  }

  return {
    model: TYPHOON_MODEL,
    page_count: pageImages.length,
    text: pageTexts.join("\n\n"),
  };
}

async function recognizePage(imageBuffer) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TYPHOON_MODEL,
      stream: false,
      messages: [
        {
          role: "user",
          content: "Extract all text from this document image. Return only the OCR result as Markdown.",
          images: [Buffer.from(imageBuffer).toString("base64")],
        },
      ],
      options: { temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Ollama returned ${response.status}: ${details}`);
  }

  const result = await response.json();
  const text = result.message?.content?.trim();
  if (!text) {
    throw new Error(`${TYPHOON_MODEL} returned no OCR text`);
  }

  return text;
}

module.exports = { runTyphoonOcr };
