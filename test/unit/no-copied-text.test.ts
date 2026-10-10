// Guards constraint C1: no prose from anyone else's game may appear in src/.
//
// The backlog asks for a maintained list of 40 sentences that must never appear. Committing
// those sentences would itself break the constraint, so the list is kept as fingerprints: for
// each sentence, a hash of its first eight words (lower-cased, punctuation dropped). The test
// fingerprints every run of eight words in src/ the same way and fails if any matches.
//
// Where a local folder of text to keep out is present (ref/orig, never committed, with the
// files to read named one per line in ref/prose.txt), a second test checks every run of eight
// words in them against src/, not just the forty.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUN = 8;
const FINGERPRINTS: readonly string[] = [
  'd7a7715640b95f0b', '469bfa676a7d9eb6', '3d3eead06f66ea06', 'f3e70e795a9d6fb1', 'f915ac39d4c4eb90',
  '8df9af386abfa4d0', '2f464530d1914a53', '81ba2b83fe2d5d6a', 'f76c4975cbda0c22', 'ffb53e24323edde0',
  '3bf8d86bd16d1461', '4fc0e6d6720cbdd7', 'cf031dc59c0817b7', 'f24da9a54f7f119a', '23a99b3c233fb250',
  'a2a5ece4fe2c202f', 'a00fdea7bb157c4e', '83f4cfe72c8c9099', '112aa2a66fed5fc6', '8fc1cbde0f1e47b5',
  'ebdaa3aa0b8abc0f', 'f0624bfac18ea28a', 'a9ded8fad3518af8', 'fdc6dce733b2f289', 'b693b92686934480',
  'f90cbb0c379875c6', 'ccec31a904c547de', '5e38935bc922ed3a', 'e423070f0a24c92a', '2e19e4dd8772f0a9',
  'b17c7367a290db52', 'b06f755eaa78dd88', 'a71e5416506fd712', '2c1a9822f87f4208', 'ef191a3151bb7bc9',
  '97c211b9a2949f3a', 'da226ecb928ef6b0', '177432e4eac21086', 'bd6b605f67e4606e', '569cc5cc4bc5a39c',
];

const words = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const fingerprint = (run: readonly string[]): string => createHash('sha256').update(run.join(' ')).digest('hex').slice(0, 16);
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const SRC = join(__dirname, '../../src');
const sources = (): { file: string; words: string[] }[] => walk(SRC).filter((f) => /\.(ts|css|html)$/.test(f)).map((file) => ({ file, words: words(readFileSync(file, 'utf8')) }));
/** Runs made mostly of numbers are table rows, not prose. */
const isProse = (run: readonly string[]): boolean => run.filter((w) => /^[a-z]+$/.test(w)).length >= RUN - 1;

describe('no copied text', () => {
  it('keeps forty fingerprints of sentences to keep out', () => {
    expect(FINGERPRINTS).toHaveLength(40);
    expect(new Set(FINGERPRINTS).size).toBe(40);
    for (const f of FINGERPRINTS) expect(f).toMatch(/^[0-9a-f]{16}$/);
  });

  it('none of them appears anywhere in src/', () => {
    const wanted = new Set(FINGERPRINTS);
    const found: string[] = [];
    let runs = 0;
    for (const { file, words: all } of sources()) {
      for (let i = 0; i + RUN <= all.length; i++) {
        runs++;
        if (wanted.has(fingerprint(all.slice(i, i + RUN)))) found.push(`${file}: ${all.slice(i, i + RUN).join(' ')}`);
      }
    }
    expect(runs).toBeGreaterThan(10000); // the scan really did read the sources
    expect(found).toEqual([]);
  });

  const REF = join(__dirname, '../../ref/orig');
  const LIST = join(__dirname, '../../ref/prose.txt');
  it.skipIf(!existsSync(REF) || !existsSync(LIST))('with the text to keep out to hand: no run of eight words from it appears in src/', () => {
    const theirs = new Set<string>();
    for (const name of readFileSync(LIST, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
      const path = join(REF, name);
      if (!existsSync(path)) continue;
      const all = words(readFileSync(path, 'latin1'));
      for (let i = 0; i + RUN <= all.length; i++) {
        const run = all.slice(i, i + RUN);
        if (isProse(run)) theirs.add(run.join(' '));
      }
    }
    expect(theirs.size).toBeGreaterThan(10000);
    const found: string[] = [];
    for (const { file, words: all } of sources()) {
      for (let i = 0; i + RUN <= all.length; i++) {
        const run = all.slice(i, i + RUN).join(' ');
        if (theirs.has(run)) found.push(`${file}: ${run}`);
      }
    }
    expect(found).toEqual([]);
  });
});
