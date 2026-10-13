import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { api } from './routes/api.ts';

const app = express();
app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
app.use(express.json({ limit: '256kb' }));
app.use('/api', api);
app.use((e: any, _q: express.Request, res: express.Response, _n: express.NextFunction) => {
  res.status(e?.status ?? 500).json({ error: e?.message ?? 'Server error' });
});
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`PawPIM server on http://localhost:${port}`));
