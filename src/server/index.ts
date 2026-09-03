import dotenv from 'dotenv';
import { createApp } from './app.js';
import { getDatabaseClient } from './db/client.js';
import { importTalentGraph } from './db/import.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);

async function startServer() {
  const db = await getDatabaseClient();

  // Check if database already has seed data; auto-import if empty
  const peopleCountRes = await db.query('SELECT count(*)::int as count FROM people;');
  if (peopleCountRes.rows[0].count === 0) {
    console.log('Database empty: initializing with bundled seed data...');
    const res = await importTalentGraph({ client: db });
    console.log(`Initialized with ${res.peopleCount} people, ${res.logicalConnectionsCount} logical connections (${res.storedDirectedRowsCount} directed rows).`);
  }

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
