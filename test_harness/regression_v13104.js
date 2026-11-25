const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cardsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'cards.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const globalCards = cardsSource.split('const GLOBAL_CARDS = [')[1].split('const BEVE_CARDS = [')[0];
for (const [name, type] of [['Чистое оружие', 'bonus'], ['Грязное оружие', 'negative']]) {
  const entry = globalCards.split('\n').find(line => line.includes(`"name": "${name}"`));
  assert.ok(entry, `«${name}» присутствует в общем каталоге`);
  assert.match(entry, new RegExp(`"type": "${type}"`));
  assert.doesNotMatch(entry, /"informational":\s*true/, 'карта доступна для выбора/активации');
}
assert.match(html, /c\.name === 'Грязное оружие'/, 'новое название дебаффа распознаётся в скорострельности');
assert.match(html, /case 'Грязное оружие':/, 'ручная активация нового названия поддержана');
assert.match(html, /card\.name === 'Грязное оружие'/, 'кампанийное применение карточки поддержано');
assert.match(html, /c\.name === 'Чистое оружие'/, 'бонус чистого оружия применяется к скорострельности');
console.log('v13.104 common weapon cards: PASS');
