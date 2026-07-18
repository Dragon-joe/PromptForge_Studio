import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const filePath = file => path.join(root, file);
const read = file => fs.readFileSync(filePath(file), 'utf8');
const fail = message => { throw new Error(message); };

const requiredFiles = [
  'index.html','assets/styles.css','assets/data.js','assets/i18n.js','assets/app.js',
  'assets/icon-192.png','assets/icon-512.png','manifest.webmanifest','sw.js','README.md',
  'START_HERE_AR.txt','docs/USER_GUIDE_AR.md','docs/USER_GUIDE_EN.md','docs/ARCHITECTURE.md'
];
for (const file of requiredFiles) if (!fs.existsSync(filePath(file))) fail(`Missing required file: ${file}`);

const html = read('index.html');
const app = read('assets/app.js');
const dataSource = read('assets/data.js');
const i18nSource = read('assets/i18n.js');
const sw = read('sw.js');
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('manifest.webmanifest'));

const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = idMatches.filter((id, index) => idMatches.indexOf(id) !== index);
if (duplicateIds.length) fail(`Duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);
const idSet = new Set(idMatches);

const requiredIds = [
  'view-dashboard','view-builder','view-templates','view-snippets','view-projects','view-guide',
  'view-settings','view-maintenance','view-about','promptOutput','conflictList','suggestionList',
  'qualityScore','templateGrid','projectList','guideContent','selfTestStatus','sidebarOverlay','saveState'
];
for (const id of requiredIds) if (!idSet.has(id)) fail(`Missing required element #${id}`);

const jsStaticIds = [...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(match => match[1]);
const missingJsIds = [...new Set(jsStaticIds.filter(id => !idSet.has(id)))];
if (missingJsIds.length) fail(`JavaScript references missing HTML ids: ${missingJsIds.join(', ')}`);

const buttons = [...html.matchAll(/<button\b([^>]*)>/gi)];
const missingButtonTypes = buttons.filter(match => !/\btype\s*=/.test(match[1]));
if (missingButtonTypes.length) fail(`${missingButtonTypes.length} button(s) are missing an explicit type attribute.`);

const context = { window:{} };
vm.createContext(context);
vm.runInContext(dataSource, context, { filename:'assets/data.js' });
vm.runInContext(i18nSource, context, { filename:'assets/i18n.js' });
const data = context.window.PFS_DATA;
const i18n = context.window.PFS_I18N;
if (!data || !i18n) fail('Data or translation bundle did not initialize.');
if (!Array.isArray(data.templates) || data.templates.length < 12) fail(`Expected at least 12 templates, found ${data?.templates?.length || 0}`);
const templateIds = data.templates.map(item => item.id);
if (new Set(templateIds).size !== templateIds.length) fail('Template ids must be unique.');
if (!i18n.ar || !i18n.en) fail('Arabic and English translation dictionaries are required.');
const i18nKeys = [...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map(match => match[1]);
for (const key of [...new Set(i18nKeys)]) {
  if (!(key in i18n.ar)) fail(`Missing Arabic translation key: ${key}`);
  if (!(key in i18n.en)) fail(`Missing English translation key: ${key}`);
}

if (fs.existsSync(filePath('backend'))) fail('Backend directory must not exist.');
const forbidden = ['127.0.0.1:8000','fastapi','sqlite3','uvicorn','/api/'];
const searchable = `${html}\n${app}\n${dataSource}\n${sw}`.toLowerCase();
for (const value of forbidden) if (searchable.includes(value.toLowerCase())) fail(`Forbidden backend reference: ${value}`);

const appVersion = app.match(/const APP_VERSION = '([^']+)'/)?.[1];
if (!appVersion) fail('APP_VERSION is missing.');
if (pkg.version !== appVersion) fail(`Version mismatch: package ${pkg.version}, app ${appVersion}`);
if (!html.includes(`v${appVersion.split('.').slice(0,2).join('.')}`)) fail('Sidebar version does not match APP_VERSION.');

if (!html.includes('Made by <span>Shark</span>')) fail('About attribution is missing.');
if (!app.includes('detectConflicts') || !app.includes('calculateQuality') || !app.includes('normalizeStoredData')) fail('Prompt analysis or reliability engine is incomplete.');

if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) fail('Manifest icons are incomplete.');
for (const icon of manifest.icons) if (!fs.existsSync(filePath(icon.src))) fail(`Missing manifest icon: ${icon.src}`);
const shellFiles = [...sw.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]).filter(Boolean);
for (const file of shellFiles) {
  if (file === '') continue;
  if (!fs.existsSync(filePath(file))) fail(`Service Worker references missing file: ${file}`);
}

console.log(`Validation passed: v${appVersion}, ${data.templates.length} templates, ${idSet.size} unique ids, bilingual strings complete, no backend files.`);
