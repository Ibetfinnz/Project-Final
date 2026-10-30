const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function isPdf(file) {
  return (
    file.mimetype === "application/pdf" ||
    path.extname(file.originalname).toLowerCase() === ".pdf"
  );
}

function isImage(file) {
  return file.mimetype.startsWith("image/");
}

function isSupportedFile(file) {
  return isPdf(file) || isImage(file);
}

/**
 * เตรียม input ให้ Typhoon OCR เป็น array ของรูปภาพ
 * - ถ้า input เป็นรูป: คืนรูปเดิมหนึ่งหน้า
 * - ถ้า input เป็น PDF: ใช้ pdftoppm แปลงทุกหน้าเป็น PNG
 */
async function fileToPageImages(file) {
  if (isImage(file)) {
    return [file.buffer];
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "idp-pages-"));

  try {
    const pdfPath = path.join(tempDirectory, "input.pdf");
    const outputPrefix = path.join(tempDirectory, "page");
    await fs.writeFile(pdfPath, file.buffer);

    // 160 DPI ให้ตัวอักษรชัดพอสำหรับ OCR โดยไม่ทำให้ภาพใหญ่เกินไป
    await execFileAsync(
      process.env.PDFTOPPM_PATH || "pdftoppm",
      ["-r", "160", "-png", pdfPath, outputPrefix],
      { maxBuffer: 30 * 1024 * 1024 },
    );

    const filenames = (await fs.readdir(tempDirectory))
      .filter((filename) => /^page-\d+\.png$/.test(filename))
      .sort(comparePageNumbers);

    if (filenames.length === 0) {
      throw new Error("PDF could not be rendered to images");
    }

    // รออ่านไฟล์ทุกหน้าให้เสร็จก่อน finally ลบโฟลเดอร์ชั่วคราว
    return await Promise.all(
      filenames.map((filename) => fs.readFile(path.join(tempDirectory, filename))),
    );
  } finally {
    // ภาพที่สร้างจาก PDF ใช้เฉพาะระหว่าง request แล้วลบทันที
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

function comparePageNumbers(left, right) {
  const leftPage = Number(left.match(/\d+/)?.[0] || 0);
  const rightPage = Number(right.match(/\d+/)?.[0] || 0);
  return leftPage - rightPage;
}

module.exports = { fileToPageImages, isImage, isPdf, isSupportedFile };
