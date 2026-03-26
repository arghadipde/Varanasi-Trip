async function uploadToCloudinary(buffer, mimetype, filename) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) throw new Error('Cloudinary env vars missing!');

  const isVideo = mimetype.startsWith('video/');
  const resourceType = isVideo ? 'video' : 'image';

  const boundary = '----FormBoundary' + Math.random().toString(36);
  const CRLF = '\r\n';

  function field(name, value) {
    return `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`;
  }

  const parts = [
    field('upload_preset', uploadPreset),
    field('folder', 'varanasi-trip'),
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
