import { config } from 'dotenv';
config({ path: '../../.env' });

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Configura DATABASE_URL y JWT_SECRET (mínimo 32 caracteres) en .env');
}
const { app } = await import('./app');
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API escuchando en http://localhost:${port}`));
