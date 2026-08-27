/**
 * EAS build helper: uploads the current working tree (including uncommitted files)
 * while excluding paths listed in .easignore.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);
process.env.EAS_NO_VCS = '1';
process.env.EAS_PROJECT_ROOT = projectRoot;

const platform = process.argv[2] || 'android';
const profile = process.argv[3] || 'preview';

const args = [
  'build',
  '--platform',
  platform,
  '--profile',
  profile,
  '--non-interactive',
  '--clear-cache',
];

const result = spawnSync('eas', args, {
  stdio: 'inherit',
  shell: true,
  cwd: projectRoot,
  env: process.env,
});

process.exit(result.status ?? 1);
