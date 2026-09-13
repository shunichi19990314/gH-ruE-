const express = require('express');
const fetch = require('node-fetch');

const app = express();
const CF_WORKER_URL = "https://game8.shunichi-0314.workers.dev";

// 生ボディを受け取る（必要に応じて）
app.use(express.raw({ type: '*/*', limit: '50mb' }));

// ホップバイホップヘッダー（転送しないもの）
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'
]);

app.all('*', async (req, res) => {
  try {
    const targetUrl = CF_WORKER_URL + req.originalUrl;

    // リクエストヘッダーをできるだけ引き継ぐ
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && value) {
        headers[key] = value;
      }
    }

    // Workerがドメイン書き換えをするために必須
    headers['X-Forwarded-Host'] = req.get('host');
    headers['X-Forwarded-Proto'] = 'https';
    headers['X-Forwarded-For'] = req.ip;

    // Accept-Encodingは明示的に指定（圧縮を正しく扱うため）
    headers['Accept-Encoding'] = 'gzip, deflate, br';

    const fetchOptions = {
      method: req.method,
      headers,
      timeout: 60000,          // Tier表は重いので長めに
      compress: true,          // node-fetchに解凍させる
      redirect: 'manual',      // リダイレクトは自分で制御
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body
    };

    const response = await fetch(targetUrl, fetchOptions);

    // リダイレクト対応
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        // 絶対URLの場合はそのまま、相対の場合はWorker経由に
        const redirectUrl = location.startsWith('http') 
          ? location 
          : CF_WORKER_URL + location;
        return res.redirect(response.status, redirectUrl);
      }
    }

    // レスポンスヘッダーの転送
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // 転送しないヘッダー
      if (
        HOP_BY_HOP.has(lowerKey) ||
        lowerKey === 'content-encoding' ||   // 解凍済みなので不要
        lowerKey === 'content-length' ||     // サイズが変わるため
        lowerKey === 'transfer-encoding'
      ) {
        return;
      }
      res.set(key, value);
    });

    // CORS（必要なら）
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');

    // ボディを返す
    const buffer = await response.buffer();
    res.status(response.status).send(buffer);

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).send('読み込みに失敗しました。Workers側を確認してください。\n' + error.message);
  }
});

// OPTIONS対応
app.options('*', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy running on port ${port}`);
});
