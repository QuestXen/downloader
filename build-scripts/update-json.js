import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pfade konfigurieren
const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const docsDir = path.join(rootDir, 'docs');
const updatesJsonPath = path.join(docsDir, 'updates.json');
const distDir = path.join(rootDir, 'dist');

// Stellen Sie sicher, dass der Docs-Ordner existiert
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Lese package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;
const productName = packageJson.build.productName;
const setupFileName = `${productName}-Setup-${version}.exe`;
const setupFilePath = path.join(distDir, setupFileName);

// Prüfen, ob die Setup-Datei existiert
if (!fs.existsSync(setupFilePath)) {
  console.error(`Setup-Datei nicht gefunden: ${setupFilePath}`);
  console.error('Bitte führen Sie erst den Build-Prozess aus.');
  process.exit(1);
}

// Berechnen des SHA512-Hashs der Setup-Datei
function calculateSha512(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha512');
  hashSum.update(fileBuffer);
  return hashSum.digest('base64');
}

// Dateigröße in Bytes ermitteln
const fileSize = fs.statSync(setupFilePath).size;
const sha512Hash = calculateSha512(setupFilePath);

// Heute-Datum im ISO-Format
const releaseDate = new Date().toISOString();

// GitHub-Repository-Infos aus package.json extrahieren
const repoUrl = packageJson.repository.url;
const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
const owner = repoMatch ? repoMatch[1] : 'QuestXen';
const repo = repoMatch ? repoMatch[2] : 'downloader';

// Konstruieren der Download-URL für GitHub Releases
const githubFileName = setupFileName.replace(/\s+/g, '.'); // Replace spaces with dots
const downloadUrl = `https://github.com/${owner}/${repo}/releases/download/v${version}/${setupFileName}`;

// Updates-JSON erstellen
const updatesJson = {
  version: version,
  releaseDate: releaseDate,
  releaseNotes: "Neue Version verfügbar. Verbesserungen und Fehlerbehebungen.",
  updateInfo: {
    win: {
      url: downloadUrl,
      sha512: sha512Hash,
      size: fileSize
    }
  }
};

// Speichern der updates.json
fs.writeFileSync(updatesJsonPath, JSON.stringify(updatesJson, null, 2));

console.log(`✅ updates.json aktualisiert für Version ${version}`);
console.log(`📁 SHA512: ${sha512Hash}`);
console.log(`📊 Größe: ${fileSize} Bytes`);
console.log(`🔗 Download-URL: ${downloadUrl}`);