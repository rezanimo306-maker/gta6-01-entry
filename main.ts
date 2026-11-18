// main.ts — SOLCOSTA handover: copies game/ and screenshots/ into the output
// directory and writes /output/dossier.json with the kit's buildDossier, so
// the gate can rebuild it byte for byte. Node standard library only; the
// grader runs it twice and both runs must write the same bytes, so nothing
// here reads the clock, the network or a random source.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Gate limits for gta6-01 (reference/gate.json): game/ at most 993 entries
// and 48 MiB, screenshots 3-4 at most 256 KiB, long side at most 1280 and
// short side at least 480, dossier text at most 160 KiB.
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 48 * 1024 * 1024;
const SHOT_MAX_BYTES = 256 * 1024;
const SHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function fail(message: string): never {
  process.stderr.write(`solcosta: ${message}\n`);
  process.exit(1);
}

/** Count files + bytes under a directory, recursively. */
function measure(dir: string): { files: number; bytes: number } {
  let files = 0, bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      const sub = measure(path);
      files += sub.files; bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1; bytes += st.size;
    }
  }
  return { files, bytes };
}

/** PNG or JPEG dimensions from the header bytes (no decoder needed). */
function imageSize(buf: Buffer): { w: number; h: number } | null {
  const isPng = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (isPng) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  const isJpeg = buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!isJpeg) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');

const gameSize = measure(gameDir);
if (gameSize.files > GAME_MAX_FILES) fail(`game/ holds ${gameSize.files} files, over the ${GAME_MAX_FILES} cap`);
if (gameSize.bytes > GAME_MAX_BYTES) fail(`game/ is ${gameSize.bytes} bytes, over the 48 MiB cap`);

const shotNames = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
if (shotNames.length < 3 || shotNames.length > 4) {
  fail(`screenshots/ holds ${shotNames.length} images: hand in 3 or 4`);
}
for (const name of shotNames) {
  if (!SHOT_NAME.test(name)) fail(`screenshots/${name}: bad name (letters, digits, . _ -)`);
  const buf = readFileSync(join(shotsDir, name));
  if (buf.length > SHOT_MAX_BYTES) fail(`screenshots/${name} is ${buf.length} bytes, over the 256 KiB cap`);
  const size = imageSize(buf);
  if (!size) fail(`screenshots/${name} is neither a whole PNG nor a whole JPEG`);
  if (Math.max(size.w, size.h) > 1280 || Math.min(size.w, size.h) < 480) {
    fail(`screenshots/${name} is ${size.w}x${size.h}: long side over 1280 or short side under 480`);
  }
}

// A fresh output every run, so the grader's two runs write the same bytes.
// Never remove the output dir itself: in the grader /output is a mount.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) rmSync(join(outDir, entry), { recursive: true, force: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The dossier is written last: the gate rebuilds it from this /output.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: SHOT_MAX_BYTES },
  game_max_files: GAME_MAX_FILES,
  game_max_bytes: GAME_MAX_BYTES,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

process.stdout.write(
  `solcosta: game/ (${gameSize.files} files, ${gameSize.bytes} bytes) + ` +
  `screenshots/ (${shotNames.length} images) -> ${outDir} + dossier.json\n`,
);
