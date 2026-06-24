const path = require('path');
const dotenv = require('dotenv');

const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, 'assets', 'env.txt') });
dotenv.config({ path: path.join(projectRoot, 'assets', '.env'), override: true });
dotenv.config({ path: path.join(projectRoot, 'assets', 'env.local'), override: true });
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

module.exports = process.env;
