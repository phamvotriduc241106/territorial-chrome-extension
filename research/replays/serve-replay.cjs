const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const server = http.createServer((req, res) => {
  let reqPath = req.url === '/' ? '/replay-viewer.html' : req.url;
  const filePath = path.join(__dirname, reqPath.split('?')[0]);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const ext = path.extname(filePath);
  const contentType = ext === '.html' ? 'text/html' : (ext === '.json' ? 'application/json' : 'text/plain');
  res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Replay Server running at http://localhost:${PORT}/`);
});
