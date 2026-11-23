'use strict';

const bcrypt = require('bcrypt');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const SALT_ROUNDS = 10;

if (!DEMO_PASSWORD) {
  console.error('DEMO_PASSWORD environment variable wajib diisi.');
  process.exit(1);
}

const demoUsers = [
  { name: 'Devrosan', username: 'devrosan', role: 'ADMIN' },
  { name: 'Raihan Haryo', username: 'raihan', role: 'SALES' },
  { name: 'Zuriel Egan', username: 'zuriel', role: 'KASIR' },
  { name: 'Jeki', username: 'jeki', role: 'GUDANG' }
];

function main() {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, SALT_ROUNDS);

  console.log('-- bcrypt cost: ' + SALT_ROUNDS);
  console.log('-- Generated password hashes for demo users.');
  console.log('');


  demoUsers.forEach((user) => {
    console.log(
      "INSERT INTO users (name, username, password, role, is_active) VALUES ('" +
      user.name + "', '" + user.username + "', '" + hash + "', '" +
      user.role + "', TRUE);"
    );
  });
}

main();
