import express from 'express';

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`api listening on :${port}`));
