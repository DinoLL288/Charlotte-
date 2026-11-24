// Local optimisation helper — run with `npm run build` (or `node scripts/build.mjs`).
// It is NOT wired into the Cloudflare Pages build: the dashboard build
// command is `npm ci --omit=dev`, so sharp (a devDependency) is not
// installed at deploy time. Run it locally before committing, then commit
// the generated files it prints.
//
// What it does:
// - data/profiles/Luke.png -> data/profiles/Luke.webp (quality 80), only
//   when the PNG is newer than the WebP or the WebP is missing. The
//   profile API now probes .webp first, so the smaller file is served
//   and the PNG remains as a fallback.
// - Prints before/after sizes.
//
// What it deliberately does NOT do:
// - It does not touch gallery/ files. The live gallery is served from
//   B2 + Google Photos and the repo gallery/* paths return 404 on the
//   site, so compressing them would not speed up the live site.
// - It does not minify JS/CSS. No minifier is installed (adding one
//   would need a package-lock update); minification stays deferred.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function newer(source, target) {
  try {
    const [s, t] = await Promise.all([fs.stat(source), fs.stat(target)]);
    return s.mtimeMs > t.mtimeMs;
  } catch {
    return true; // target missing (or source unreadable) -> (re)build
  }
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

const jobs = [
  {
    src: path.join(root, 'data', 'profiles', 'Luke.png'),
    out: path.join(root, 'data', 'profiles', 'Luke.webp'),
    make: (sharp, src) => sharp(src).webp({ quality: 80 }).toFile(path.join(root, 'data', 'profiles', 'Luke.webp')),
  },
];

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('sharp is not installed. Run `npm ci` (without --omit=dev) first, then `npm run build` again.');
  process.exit(1);
}

for (const job of jobs) {
  let srcStat;
  try {
    srcStat = await fs.stat(job.src);
  } catch {
    console.log('Skipping (source missing): ' + path.relative(root, job.src));
    continue;
  }
  if (!(await newer(job.src, job.out))) {
    console.log('Up to date: ' + path.relative(root, job.out));
    continue;
  }
  await job.make(sharp, job.src);
  const outStat = await fs.stat(job.out);
  console.log(
    'Built ' + path.relative(root, job.out) + ': ' + kb(srcStat.size) + ' -> ' + kb(outStat.size) +
    ' (commit the generated file; the profile API probes .webp first)'
  );
}
console.log('Done. Remember: generated files are only live once committed.');
