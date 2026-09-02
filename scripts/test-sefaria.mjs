import { getText, findBestSource } from '../src/torah/sefaria-client.mjs';

const tests = [
  { kind: 'ref', label: 'Tanakh direct ref', ref: 'Genesis 1:1' },
  { kind: 'ref', label: 'Bavli direct ref', ref: 'Berakhot 2a:1' },
  { kind: 'ref', label: 'Rambam direct ref', ref: 'Mishneh Torah, Human Dispositions 1:1' },
  { kind: 'ref', label: 'Shulchan Arukh direct ref', ref: 'Shulchan Arukh, Orach Chayim 1:1' },
  { kind: 'search', label: 'Tanakh exact phrase', query: 'צדק צדק תרדוף', scope: 'tanakh' },
  { kind: 'search', label: 'Tanakh phrase', query: 'כמים הפנים לפנים', scope: 'tanakh' },
  { kind: 'search', label: 'Broad Hebrew phrase', query: 'אין אדם נוגע במוכן לחבירו', scope: 'all' }
];

let failures = 0;
for (const t of tests) {
  try {
    const result = t.kind === 'ref'
      ? await getText(t.ref)
      : await findBestSource(t.query, t.scope);
    const count = t.kind === 'ref'
      ? (result?.versions?.length ?? 0)
      : (result?.hits?.hits?.length ?? 0);
    const ok = count > 0;
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${t.label} | results=${count}`);
    if (!ok) failures++;
  } catch (err) {
    failures++;
    console.error(`FAIL | ${t.label} | ${err.message}`);
  }
}

process.exitCode = failures ? 1 : 0;
