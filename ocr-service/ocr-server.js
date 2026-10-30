const express = require("express");
const multer = require("multer");
const { fileToPageImages, isSupportedFile } = require("./pdf-image-utils");
const { runTyphoonOcr } = require("./typhoon-ocr");

const app = express();
const port = Number(process.env.PORT || 3001);
const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 20);

// เก็บไฟล์ไว้ในหน่วยความจำ เพราะ OCR ใช้ไฟล์เพียงชั่วคราว
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
});

app.get("/health", (_req, res) => {
  res.json({ success: true, service: "ocr", status: "ready" });
});

// OCR หลัก: ใช้โมเดล Typhoon OCR ที่รันอยู่ใน Ollama
app.post("/typhoon-ocr", upload.single("file"), (req, res) => {
  handleOcrRequest(req, res, runTyphoonOcr);
});

/**
 * ขั้นตอนของ Typhoon OCR:
 * 1. ตรวจว่าได้รับ PDF หรือรูปภาพ
 * 2. แปลง PDF เป็นภาพทีละหน้า (รูปภาพใช้ได้ทันที)
 * 3. ส่งภาพทั้งหมดให้ Typhoon OCR
 * 4. คืนข้อความในรูปแบบ JSON ให้ n8n
 */
async function handleOcrRequest(req, res, recognize) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "file is required" });
  }

  if (!isSupportedFile(req.file)) {
    return res.status(400).json({
      success: false,
      error: "file must be a PDF or image",
    });
  }

  try {
    const pageImages = await fileToPageImages(req.file);
    const result = await recognize(pageImages);

    return res.json({
      success: true,
      filename: req.file.originalname,
      ...result,
    });
  } catch (error) {
    console.error("OCR failed:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`OCR server ready at http://localhost:${port}`);
  });
}

module.exports = { app, handleOcrRequest };
