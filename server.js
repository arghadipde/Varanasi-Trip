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

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function readData() {
  if (!fs.existsSync(DATA_FILE)) return { files: [] };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth });
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const drive = getDriveClient();
    const file = req.file;
    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);

    const driveRes = await drive.files.create({
      requestBody: { name: file.originalname, parents: [FOLDER_ID] },
      media: { mimeType: file.mimetype, body: bufferStream },
      fields: 'id',
    });

    const fileId = driveRes.data.id;
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });

    const publicUrl = `https://drive.google.com/uc?id=${fileId}`;
    const data = readData();
    data.files.unshift({ url: publicUrl, timestamp: new Date().toISOString() });
    writeData(data);

    res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/files', (req, res) => {
  res.json(readData());
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));