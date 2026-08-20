// Run with: npm run setup-admin
// Prompts for a password, prints the bcrypt hash to paste into .env as ADMIN_PASSWORD_HASH

const readline = require('readline');
const bcrypt = require('bcryptjs');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Choose an admin password: ', (password) => {
  if (!password || password.length < 6) {
    console.log('\nPassword should be at least 6 characters. Run again.');
    rl.close();
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  console.log('\nAdd this line to your .env file:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
  rl.close();
});
