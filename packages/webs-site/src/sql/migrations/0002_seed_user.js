export default {
  version: 2,
  up: (db) => {
    console.log('Seeding test user...');
    const test_password = Bun.password.hashSync('password', {
      algorithm: 'bcrypt',
      cost: 10,
    });
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO users (email, username, password) VALUES (?, ?, ?)',
    );
    stmt.run('anon@webs.site', 'anon', test_password);
    console.log('Test user seeded successfully.');
  },
};
