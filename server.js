const express = require('express');
const fetch = require('node-fetch'); // "node-fetch": "^2.7.0"

const app = express();

// Cloudflare WorkerのURL
const CF_WORKER_URL = "https://game8.shunichi-0314.workers.dev";

// 生のボディをそのまま受け取る（JSONでもformでもバイナリでもOK）
app.use(express.raw({ type: '*/*', limit: '50mb' }));

app.all('*', async (req, res) => {
  try {
    const targetUrl = CF_WORKER_URL + req.url;

    // 転送するヘッダーを準備
    const headers = {
      'X-Forwarded-Host': req.get('host'),
      'X-Forwarded-Proto': 'https',
      'User-Agent': req.headers['user-agent'] || '',
      'Accept': req.headers['accept'] || '*/*',
      'Cookie': req.headers['cookie'] || '',
    };

    // 元のリクエストにあった重要なヘッダーも引き継ぐ
    const passThrough = [
      'content-type',
      'authorization',
      'x-api-key',
      'accept-language',
      'origin',
      'referer'
    ];
    for (const h of passThrough) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }

    const fetchOptions = {
      method: req.method,
      headers,
      timeout: 30000,
      // bodyがあるメソッドだけボディを付ける
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body
    };

    const response = await fetch(targetUrl, fetchOptions);

    // レスポンスヘッダーをできるだけ引き継ぐ
    const contentType = response.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);

    // CORS（必要に応じて調整）
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');

    const buffer = await response.buffer();
    res.status(response.status).send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).send('読み込みに失敗しました。Workers側を確認してください。');
  }
});

// OPTIONS プリフライト用（CORSを使う場合）
app.options('*', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  res.status(204).end();
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Proxy running on port ${process.env.PORT || 3000}`);
});
