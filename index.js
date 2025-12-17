const express = require('express');
const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const HOST = '0.0.0.0';

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  const readmePath = path.join(__dirname, 'README.md');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const htmlContent = marked(readmeContent);
  
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YOM Airdrop</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      color: #e4e4e4;
      padding: 40px 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 40px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h2, h3 {
      color: #00d4ff;
      margin-bottom: 20px;
    }
    h2 {
      font-size: 1.8rem;
      border-bottom: 2px solid #00d4ff;
      padding-bottom: 10px;
    }
    h3 {
      font-size: 1.4rem;
      color: #ffd700;
    }
    p {
      line-height: 1.8;
      margin-bottom: 15px;
    }
    a {
      color: #00d4ff;
      text-decoration: none;
      transition: color 0.3s ease;
    }
    a:hover {
      color: #ffd700;
      text-decoration: underline;
    }
    ul {
      list-style: none;
      padding-left: 0;
    }
    li {
      padding: 10px 0;
      padding-left: 25px;
      position: relative;
    }
    li:before {
      content: "→";
      position: absolute;
      left: 0;
      color: #00d4ff;
    }
  </style>
</head>
<body>
  <div class="container">
    ${htmlContent}
  </div>
</body>
</html>
  `);
});

app.listen(PORT, HOST, () => {
  console.log('Server running at http://' + HOST + ':' + PORT);
});
