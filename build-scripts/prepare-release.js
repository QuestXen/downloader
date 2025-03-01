import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Führe den Build aus
console.log('🔨 Erstelle App...');
execSync('npm run build', { stdio: 'inherit' });

// Aktualisiere die updates.json
console.log('📝 Aktualisiere updates.json...');
execSync('npm run update-json', { stdio: 'inherit' });

// Git-Befehle für Commit und Push (optional)
try {
  // Überprüfen, ob Git verfügbar ist
  execSync('git --version', { stdio: 'ignore' });
  
  // Status anzeigen
  console.log('📊 Git Status:');
  execSync('git status', { stdio: 'inherit' });
  
  // Frage, ob Änderungen committet werden sollen
  console.log('\n🤔 Möchten Sie die Änderungen committen und pushen? (y/n)');
  process.stdin.once('data', (data) => {
    const input = data.toString().trim().toLowerCase();
    
    if (input === 'y' || input === 'yes') {
      try {
        // Änderungen hinzufügen
        execSync('git add docs/updates.json', { stdio: 'inherit' });
        
        // Commit erstellen
        const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
        const version = packageJson.version;
        execSync(`git commit -m "Update zu Version ${version}"`, { stdio: 'inherit' });
        
        // Push
        execSync('git push', { stdio: 'inherit' });
        
        console.log('✅ Änderungen wurden committet und gepusht!');
      } catch (error) {
        console.error('❌ Git-Fehler:', error.message);
      }
    } else {
      console.log('❌ Abgebrochen. Änderungen wurden nicht committet.');
    }
    
    process.exit(0);
  });
} catch (error) {
  console.log('⚠️ Git ist nicht verfügbar. Überspringen der Git-Operationen.');
  process.exit(0);
}