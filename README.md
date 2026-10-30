# ระบบ AR (Accounts Receivable) — คู่มือติดตั้งและใช้งาน

ระบบจัดการรายรับ: ออกเอกสาร (ใบสั่งซื้อ/ใบแจ้งหนี้/ใบวางบิล/ใบเสร็จ/ใบกำกับภาษี),
อ่านเอกสารด้วย OCR ในเครื่อง (Typhoon OCR + Ollama), ตรวจสลิปการโอนเงิน, แดชบอร์ด และแจ้งเตือน

คู่มือนี้เริ่มจาก **git clone** ไปจนถึงเปิดใช้งานได้จริงบนเครื่องตัวเอง (Windows + Docker Desktop)

---

## 1. ภาพรวมระบบ

```
                    ┌──────────────────────────── Docker Compose ────────────────────────────┐
 เบราว์เซอร์ ─:3000─► frontend (nginx + React) ─/api─► backend (Node/Express) ─► db (Postgres)
                                                          │  ▲
                                                          │  │ ผล OCR (x-api-key)
                                    webhook (x-webhook-key)│  │
                                                          ▼  │
                                                       n8n (workflow B) ─► ocr ─► ollama
                                                                              (Typhoon OCR 3B + 8B)
                    └────────────────────────────────────────────────────────────────────────┘
```

| Service | ภาพรวม | พอร์ต |
|---|---|---|
| `frontend` | React (Vite) + nginx, proxy `/api` ไป backend | `3000` |
| `backend` | REST API + สร้าง PDF + ส่งอีเมล + cron งานเกินกำหนด | `4000` |
| `db` | PostgreSQL 16 (schema รันอัตโนมัติจาก `db/init.sql` ครั้งแรก) | ภายในเท่านั้น |
| `n8n` | Workflow OCR / Gmail / แจ้งเตือน error | `5678` |
| `ocr` | แปลง PDF→รูป แล้วเรียก Ollama | `127.0.0.1:3001` (ทดสอบ) |
| `ollama` | โมเดล `typhoon-ocr1.5-3b` + `llama3.1-typhoon2-8b` | `127.0.0.1:11435` (ทดสอบ) |

---

## 2. สิ่งที่ต้องมี

| รายการ | ขั้นต่ำ | แนะนำ |
|---|---|---|
| Docker Desktop (WSL2 backend) | 4.x | 4.37+ |
| RAM | 16 GB | 16 GB + ปิดโปรแกรมหนักระหว่าง OCR |
| พื้นที่ดิสก์ | 25 GB | 40 GB (โมเดล ~8 GB + image) |
| Git | มีก็พอ | latest |

> ไม่ต้องติดตั้ง Node.js, Postgres หรือ Ollama บนเครื่อง เพราะรันใน Docker ทั้งหมด

---

## 3. ติดตั้ง

### 3.1 Clone โปรเจกต์

```bash
git clone <REPO_URL> ar-system
cd ar-system
```

> แทน `<REPO_URL>` ด้วย URL จริงของ repo (เช่น `https://github.com/<user>/ar-system.git`)

### 3.2 ตั้งค่า RAM ให้ Docker (สำคัญ — อย่าข้าม)

Ollama ต้องโหลดโมเดล 2 ตัวรวมกันเกือบ 9 GB แต่ค่าเริ่มต้นของ WSL ให้เพียง 50% ของ RAM
(บนเครื่อง 16 GB = ~7.7 GB) ทำให้ **WSL ถูก kill กลางทาง** แล้วเจออาการ
`Docker Error` หรือ n8n ขึ้น `Workflow did not finish, possible out-of-memory issue`

คัดลอกไฟล์ตัวอย่างไปไว้ที่ home ของผู้ใช้:

```powershell
# Windows PowerShell
Copy-Item .wslconfig.example "$env:USERPROFILE\.wslconfig"
```

เนื้อหาที่ได้:

```ini
[wsl2]
memory=10GB
swap=4GB
autoMemoryReclaim=gradual
sparseVhd=true
```

จากนั้นปิด Docker Desktop แล้วเปิดใหม่ (หรือรัน `wsl --shutdown` ก่อนเปิด Docker)

### 3.3 สร้างไฟล์ `.env`

```bash
cp .env.example .env
```

แก้ค่าที่จำเป็น:

| ตัวแปร | ใส่อะไร |
|---|---|
| `DB_PASS` | รหัสผ่านฐานข้อมูล (ตั้งเองได้) |
| `JWT_SECRET` | สตริงสุ่มยาว ๆ |
| `INTERNAL_API_KEY` | คีย์ที่ n8n ใช้เรียก backend (ต้องตรงกับ credential ใน n8n) |
| `N8N_WEBHOOK_KEY` | คีย์ที่ backend ใช้เรียก n8n (ต้องตรงกับ credential ใน n8n) |
| `N8N_ENCRYPTION_KEY` | สตริงสุ่ม 32 ตัวอักษร (ใช้เข้ารหัส credential ของ n8n) |
| `SMTP_USER` / `SMTP_PASS` | Gmail + **App Password 16 หลัก** (ไม่ใช่รหัสผ่านปกติ) |
| `MAIL_FROM` | ชื่อผู้ส่งที่แสดงให้ลูกค้าเห็น |
| `COMPANY_*`, `BANK_INFO` | ข้อมูลบริษัทที่จะพิมพ์บนหัว PDF |

สร้างสตริงสุ่มเร็ว ๆ:

```powershell
-join ((48..57) + (97..102) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

```bash
openssl rand -hex 24
```

> `N8N_UPLOAD_WEBHOOK` ต้องเป็น `http://n8n:5678/webhook/ar-upload` (ชื่อ service ใน compose) ไม่ใช่ localhost

### 3.4 Build และ start ทุก service

```bash
docker compose up -d --build
```

ครั้งแรกจะใช้เวลาหลายนาที (build backend ที่มี Chromium + ฟอนต์ไทย, frontend, ocr)

ตรวจว่าขึ้นครบ 6 ตัว:

```bash
docker compose ps
```

ต้องเห็น `db`, `backend`, `frontend`, `n8n`, `ocr`, `ollama` สถานะ `Up` ทั้งหมด

### 3.5 สร้างผู้ใช้เริ่มต้น (seed)

รอให้ `db` พร้อมก่อน แล้วรัน:

```bash
docker compose exec backend npm run seed
```

ได้บัญชี:

```
email    : ar@example.com
password : ChangeMe123!
```

> เปลี่ยนรหัสผ่านทันทีเมื่อใช้งานจริง และ seed จะไม่ทับข้อมูลเดิม (ใช้ `ON CONFLICT DO NOTHING`)

### 3.6 ดาวน์โหลดโมเดลให้ Ollama

ยังไม่มีโมเดลในเครื่อง ต้อง pull เอง (รวม ~8 GB):

```bash
docker compose exec ollama ollama pull scb10x/typhoon-ocr1.5-3b:latest
docker compose exec ollama ollama pull scb10x/llama3.1-typhoon2-8b-instruct:latest
```

ตรวจ:

```bash
docker compose exec ollama ollama list
```

> ถ้าข้ามขั้นนี้ OCR จะตอบ `model not found` และหน้าเว็บจะขึ้น "อ่านเอกสารไม่สำเร็จ"

### 3.7 ตั้งค่า n8n

เปิด http://localhost:5678 แล้วสร้างบัญชี owner ของ n8n (ครั้งแรกเท่านั้น)

**ก. Import workflow** — เมนู *Workflows → Import from File* ทีละไฟล์ในโฟลเดอร์ `n8n/`

| ไฟล์ | หน้าที่ |
|---|---|
| `AR - A_ OCR ใบสั่งซื้อจาก Gmail.json` | รับเมล PO จาก Gmail → OCR → บันทึกเอกสาร |
| `AR - B_ OCR สลิปจากหน้าอัปโหลด (OCR ในเครื่อง).json` | รับไฟล์จากหน้าเว็บ → OCR → ส่งผลกลับ backend |
| `AR - C_ แจ้งเตือนเมื่อเกิด error.json` | ส่งอีเมลเมื่อ workflow อื่น error |

**ข. สร้าง Credentials** — เมนู *Credentials → Create*

| ชื่อ | ชนิด | ค่า |
|---|---|---|
| `AR Backend Key` | Header Auth | Name: `x-api-key` / Value: `INTERNAL_API_KEY` จาก `.env` |
| `AR Webhook Key` | Header Auth | Name: `x-webhook-key` / Value: `N8N_WEBHOOK_KEY` จาก `.env` |
| `Gmail account` | Gmail OAuth2 API | ใช้กับ workflow A (ต้องสร้าง OAuth client ใน Google Cloud + เปิด Gmail API) |
| `SMTP account` | SMTP | host `smtp.gmail.com`, port `465`, SSL, user/pass = Gmail App Password |

**ค. ผูก credential ให้ node** — เปิดแต่ละ workflow แล้วเลือก credential ใน node ที่ไฮไลต์สีส้ม

- Workflow A: `Gmail Trigger`, `Mark as read` → `Gmail account`; `Send to backend` → `AR Backend Key`; `Email AR team` → `SMTP account`
- Workflow B: `Webhook` → `AR Webhook Key`; `Download file1` และ `Send OCR result to backend` → `AR Backend Key`
- Workflow C: `Email on error` → `SMTP account`

**ง. เปิดใช้งาน** — กด **Active** ทั้ง A, B, C
และตั้ง *Settings → Error Workflow* ของ A และ B เป็น workflow C

> Workflow B ต้อง Active และ path ต้องเป็น `ar-upload` (Production URL: `http://localhost:5678/webhook/ar-upload`)

### 3.8 ตรวจสอบระบบ

| จุดตรวจ | URL | ผลที่ต้องได้ |
|---|---|---|
| หน้าเว็บ | http://localhost:3000 | หน้า Login |
| Backend health | http://localhost:4000/api/health | `{"ok":true}` |
| OCR health | http://localhost:3001/health | `{"success":true,...}` |
| n8n | http://localhost:5678 | หน้า Workflows |

---

## 4. เริ่มใช้งาน

1. เปิด http://localhost:3000 แล้ว login ด้วย `ar@example.com` / `ChangeMe123!`
2. **แดชบอร์ด** — ดูยอดค้างชำระ / ชำระแล้ว / เกินกำหนด
3. **สร้างเอกสาร** — เลือกประเภท + ลูกค้า + รายการ → ระบบรันเลขที่และคำนวณ VAT เอง
4. **อัปโหลดเอกสาร** — ลากไฟล์ PDF/รูป (≤ 8 MB) → รอ OCR (CPU ประมาณ 2–5 นาที/หน้า)
   → ตรวจแก้ข้อมูลที่ระบบอ่านได้ → กด **บันทึกลงฐานข้อมูล**
5. **ตรวจสอบสลิป** — สลิปที่อัปโหลดจะถูกจับคู่กับใบแจ้งหนี้ให้อัตโนมัติ → กดยืนยัน

> ระหว่าง OCR อย่าปิด Docker Desktop และควรปิดโปรแกรมที่ใช้ RAM มาก

---

## 5. ทางเลือก: ใช้ GPU

ถ้ามี NVIDIA GPU และติดตั้ง NVIDIA Container Toolkit ใน Docker แล้ว:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

---

## 6. คำสั่งที่ใช้บ่อย

```bash
docker compose ps                    # ดูสถานะ
docker compose logs -f backend       # ดู log backend
docker compose logs -f n8n           # ดู log n8n
docker compose restart backend       # restart เฉพาะ service
docker compose up -d --build backend # rebuild หลังแก้โค้ด backend
docker compose down                  # หยุดทั้งหมด (ข้อมูลยังอยู่)
docker compose down -v               # หยุด + ลบ volume (ข้อมูลหายทั้งหมด!)
```

สำรองฐานข้อมูล:

```bash
docker compose exec db pg_dump -U app accounting > backup.sql
```

กู้คืน:

```bash
docker compose exec -T db psql -U app -d accounting < backup.sql
```

อัปเดตโค้ด:

```bash
git pull
docker compose up -d --build
```

---

## 7. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| หน้าเว็บขึ้น **502 Bad Gateway** | backend ตาย/ไม่ขึ้น | `docker compose logs backend --tail 50` แล้วแก้ตาม error |
| backend ขึ้น `does not provide an export named 'default'` | ลืม `export default r;` ท้ายไฟล์ route | เติมบรรทัด export แล้ว `docker compose up -d --build backend` |
| n8n ขึ้น **possible out-of-memory issue** / Docker Engine หลุด | WSL RAM ไม่พอ | ทำข้อ 3.2 และตรวจ `OLLAMA_MAX_LOADED_MODELS=1` ใน compose |
| OCR ตอบ `model not found` | ยังไม่ pull โมเดล | ทำข้อ 3.6 |
| อัปโหลดแล้วค้าง `processing` ตลอด | workflow B ไม่ Active หรือคีย์ไม่ตรง | เปิด Active + เทียบ `N8N_WEBHOOK_KEY` กับ credential `AR Webhook Key` |
| backend ฟ้อง `n8n ปฏิเสธคีย์ (403)` | `N8N_WEBHOOK_KEY` ไม่ตรงกับ credential | แก้ให้ตรงกันทั้งสองฝั่ง |
| backend ฟ้อง `ไม่พบ webhook (404)` | workflow B ไม่ Active / path ไม่ใช่ `ar-upload` | เปิด Active และเช็ก path |
| ส่งอีเมลไม่สำเร็จ `535` | ใช้รหัสผ่าน Gmail ปกติ | สร้าง App Password 16 หลัก แล้วใส่ `SMTP_PASS` |
| พอร์ตชน (3000/4000/5678) | มีโปรแกรมอื่นใช้อยู่ | แก้เลขพอร์ตซ้ายใน `docker-compose.yml` |
| แก้ `db/init.sql` แล้วไม่มีผล | script รันเฉพาะตอนสร้าง volume ครั้งแรก | `docker compose down -v` (ข้อมูลหาย) หรือทำ migration เอง |

---

## 8. โครงสร้างโปรเจกต์

```
ar-system/
├─ docker-compose.yml          # db + backend + n8n + frontend + ocr + ollama
├─ docker-compose.gpu.yml      # เปิด GPU ให้ ollama (ทางเลือก)
├─ .env.example                # คัดลอกเป็น .env แล้วแก้ค่า
├─ .wslconfig.example          # ตั้ง RAM ให้ WSL/Docker
├─ db/init.sql                 # schema ทั้งหมด (รันครั้งแรกที่สร้าง volume)
├─ backend/                    # Node.js + Express
│  └─ src/
│     ├─ index.js, config.js, db.js, auth.js, seed.js
│     ├─ routes/               # auth customers documents slips upload dashboard notifications internal
│     ├─ services/             # docs pdf mailer n8n ingest
│     └─ jobs/overdue.js       # cron อัปเดตสถานะ "เกินกำหนด"
├─ frontend/                   # React (Vite) + nginx
│  └─ src/pages/               # Dashboard, CreateDocument, DocumentList, VerifyPayment, UploadFile, Login
├─ ocr-service/                # Express + poppler + Ollama client
└─ n8n/                        # workflow ที่ import ได้ (A, B, C)
```

---

## 9. หลักการทำงานที่ควรรู้

- **เลขเอกสาร** สร้างฝั่ง backend (`TYPE-ปีพ.ศ.-running4หลัก`) ด้วย upsert ใน transaction จึงไม่ซ้ำ
- **VAT/ยอดรวม** คำนวณใหม่ฝั่ง backend เสมอ ไม่เชื่อค่าจาก frontend หรือ OCR
- **กันเอกสารซ้ำ** ด้วย `documents.source_ref` (UNIQUE) — n8n ส่งซ้ำก็ไม่เกิดเอกสารซ้ำ
- **การจับคู่สลิป** ① เลขเอกสารในหมายเหตุ/ข้อความสลิป ② ยอดเงินตรงเพียงใบเดียว ③ ยอดตรงหลายใบดูชื่อผู้โอน
  ผล `matched` แล้วเอกสารยังเป็น `รอตรวจสอบสลิป` จนกว่าเจ้าหน้าที่จะกดยืนยัน
- **OCR 2 ขั้น**: `typhoon-ocr1.5-3b` อ่านภาพเป็นข้อความ → `llama3.1-typhoon2-8b` สกัดเป็น JSON
  (โหลดทีละโมเดลด้วย `OLLAMA_MAX_LOADED_MODELS=1`)
- **แดชบอร์ด** คิดยอดจาก INV เท่านั้น เพื่อไม่ให้นับซ้ำกับ BN ที่รวมหลาย INV

---

## 10. Production checklist

- เปลี่ยนรหัสผ่าน seed และตั้ง `JWT_SECRET` / คีย์ทุกตัวให้ยาวและสุ่ม
- วางหลัง reverse proxy ที่มี HTTPS (Caddy/Nginx) และปิดพอร์ต 4000/5678 จากภายนอก
- สำรอง volume `pgdata`, `uploads`, `n8ndata` เป็นประจำ และ export workflow เก็บใน Git
- ลองใช้ OCR กับเอกสารจริง 20–30 ใบก่อนใช้งานจริง โดยเฉพาะยอดเงินและเลขผู้เสียภาษี
  (`confidence < 0.8` ระบบจะตั้งเป็น "ข้อมูลไม่ถูกต้อง" ให้คนตรวจ)
- ตั้ง backup อัตโนมัติของ `docker compose exec db pg_dump ...`
