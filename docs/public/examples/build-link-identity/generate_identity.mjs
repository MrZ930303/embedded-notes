// Original embedded-notes teaching code, 2026. No third-party license grant.
// Node builtins only. Inputs are bytes; no timestamps, paths, generated self-hash.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const manifestMembers = Object.freeze([
  'build.json', 'build_identity.h', 'entry.c', 'generate_identity.mjs',
  'lesson.ld', 'main.c', 'measurement.c', 'measurement.h'
]);

/** Validate the complete descriptor before creating C tokens or writing output. */
export function generateIdentity(directory) {
  const descriptor = JSON.parse(readFileSync(join(directory, 'build.json'), 'utf8'));
  if (!descriptor || Object.keys(descriptor).sort().join(',') !== 'product,schema,sourceManifest,version' ||
      descriptor.schema !== 1 || descriptor.product !== 'acquisition-terminal' ||
      typeof descriptor.version !== 'string' || !/^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/.test(descriptor.version) ||
      !Array.isArray(descriptor.sourceManifest) ||
      descriptor.sourceManifest.length !== manifestMembers.length ||
      !manifestMembers.every((name, index) => descriptor.sourceManifest[index] === name)) {
    throw new Error('INVALID_DESCRIPTOR: schema1, fixed product, bounded numeric version and exact ordered members required');
  }
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const members = manifestMembers.map(name => ({ name, sha256: sha256(readFileSync(join(directory, name))) }));
  // SHA256(UTF8(name + space + lowercase member digest + LF), in declared order).
  const manifest = members.map(member => `${member.name} ${member.sha256}\n`).join('');
  const manifestSha256 = sha256(Buffer.from(manifest, 'utf8'));
  // All C literal values use validated safe ASCII alphabets; no unescaped input.
  const source = `/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file build_identity.c
 * @brief Deterministic generated identity. Regenerate; do not edit by hand.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "build_identity.h"

const char build_version[] = "${descriptor.version}";
const char build_product[] = "${descriptor.product}";
const char build_source_manifest_sha256[] = "${manifestSha256}";
`;
  return { source, version: descriptor.version, manifestSha256, members };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 4 || (process.argv[3] && process.argv[3] !== '--check')) {
      throw new Error('Usage: node generate_identity.mjs [source-directory] [--check]');
    }
    const directory = resolve(process.argv[2] || dirname(fileURLToPath(import.meta.url)));
    const generated = generateIdentity(directory);
    const destination = join(directory, 'build_identity.c');
    if (process.argv[3] === '--check') {
      if (!readFileSync(destination).equals(Buffer.from(generated.source))) {
        throw new Error('STALE_IDENTITY: regenerate before compiling');
      }
    } else {
      writeFileSync(destination, generated.source, 'utf8');
    }
    console.log(JSON.stringify({ version: generated.version, sourceManifestSha256: generated.manifestSha256,
      generatedSha256: createHash('sha256').update(generated.source).digest('hex'), members: generated.members }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
