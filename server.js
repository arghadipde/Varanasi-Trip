const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.options('*', cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ files: [] }, null, 2));
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { return { files: [] }; }
}

function writeData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error(e); }
}

async function uploadToCloudinary(buffer, mimetype, filename) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  console.log('Cloudinary config:', { cloudName, uploadPreset });

  if (!cloudName || !uploadPreset) throw new Error('Cloudinary env vars missing!');

  const isVideo = mimetype.startsWith('video/');
  const resourceType = isVideo ? 'video' : 'image';

  const boundary = '----FormBoundary' + Date.now().toString(36);
  const CRLF = '\r\n';

  function field(name, value) {
    return `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`;
  }

  const parts = [
    field('upload_preset', uploadPreset),
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${mimetype}${CRLF}${CRLF}`,
  ];

  const bodyStart = Buffer.from(parts.join(''), 'utf8');
  const bodyEnd = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
  const body = Buffer.concat([bodyStart, buffer, bodyEnd]);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${cloudName}/${resourceType}/upload`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('Cloudinary response:', JSON.stringify(json).substring(0, 200));
          if (json.error) reject(new Error(json.error.message));
          else resolve(json.secure_url);
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Upload started:', req.file?.originalname);
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, req.file.originalname);
    console.log('Uploaded successfully:', url);

    const isVideo = req.file.mimetype.startsWith('video/');
    const data = readData();
    data.files.unshift({ url, name: req.file.originalname, isVideo, timestamp: new Date().toISOString() });
    writeData(data);

    res.json({ success: true, url });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/files', (req, res) => res.json(readData()));
app.get('/', (req, res) => res.json({ status: 'ok', message: 'Varanasi Trip Backend Running ✅' }));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
