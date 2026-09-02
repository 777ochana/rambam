import fs from 'node:fs/promises';
import path from 'node:path';

const BOOKS_URL = 'https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json';
const OUT_DIR = path.resolve('data/torah');

function wanted(book) {
  if (book.language !== 'Hebrew') return false;
  if (book.versionTitle !== 'merged') return false;
  const cats = book.categories || [];
  const title = book.title || '';
  return (
    cats.includes('Tanakh') ||
    (cats.includes('Talmud') && cats.includes('Bavli')) ||
    title.startsWith('Mishneh Torah') ||
    title.startsWith('Shulchan Arukh')
  );
}

function slug(s) {
  return s.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

await fs.mkdir(OUT_DIR, { recursive: true });
const catalog = await fetchJson(BOOKS_URL);
const books = catalog.books.filter(wanted);

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceGeneratedAt: catalog.generated_at,
  source: 'Sefaria-Export',
  strategy: 'Hebrew merged exports only; Sefaria exporter excludes copyrighted source versions from merged export.',
  packs: { tanakh: 0, bavli: 0, rambam: 0, shulchanArukh: 0 },
  books: []
};

for (const [i, book] of books.entries()) {
  if (!book.json_url) continue;
  const data = await fetchJson(book.json_url);
  const file = `${slug(book.title)}.json`;
  await fs.writeFile(path.join(OUT_DIR, file), JSON.stringify(data), 'utf8');

  const cats = book.categories || [];
  let pack = 'other';
  if (cats.includes('Tanakh')) pack = 'tanakh';
  else if (cats.includes('Talmud') && cats.includes('Bavli')) pack = 'bavli';
  else if (book.title.startsWith('Mishneh Torah')) pack = 'rambam';
  else if (book.title.startsWith('Shulchan Arukh')) pack = 'shulchanArukh';
  if (pack !== 'other') manifest.packs[pack]++;

  manifest.books.push({ title: book.title, categories: cats, pack, file, sourceUrl: book.json_url });
  process.stdout.write(`\r${i + 1}/${books.length} ${book.title}                    `);
}

await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('\nBuilt Torah pack:', manifest.packs);
