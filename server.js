const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const FOLDER_ID = '1_XrDptxcXTlHxHU9EMebPwv8lX1hPiM2';

// ── CORS ──────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.use(express.json());

// ── Multer ────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ── Data helpers ──────────────────────────────────────────
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ files: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('readData error:', e.message);
    return { files: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('writeData error:', e.message);
  }
}

// ── Google Drive client ───────────────────────────────────
function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is missing!');

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ' + e.message);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// ── POST /upload ──────────────────────────────────────────
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Upload request received');

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log('File:', req.file.originalname, req.file.mimetype, req.file.size);

    const drive = getDriveClient();

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    const driveRes = await drive.files.create({
      requestBody: {
        name: req.file.originalname,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: req.file.mimetype,
        body: bufferStream,
      },
      fields: 'id, name',
    });

    const fileId = driveRes.data.id;
    console.log('Uploaded to Drive, fileId:', fileId);

    // Make public
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    console.log('Made public');

    const publicUrl = `https://drive.google.com/uc?id=${fileId}`;

    // Save to data.json
    const data = readData();
    data.files.unshift({
      url: publicUrl,
      name: req.file.originalname,
      timestamp: new Date().toISOString()
    });
    writeData(data);

    console.log('Saved to data.json, responding success');
    res.json({ success: true, url: publicUrl });

  } catch (err) {
    console.error('Upload error:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /files ────────────────────────────────────────────
app.get('/files', (req, res) => {
  const data = readData();
  res.json(data);
});

// ── Health check ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Varanasi Trip Backend Running ✅' });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
