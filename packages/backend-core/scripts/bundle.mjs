// Bundles @aetas/backend-core (and the @aetas/game-engine it pulls in) into a
// single self-contained ESM file that Supabase Edge Functions (Deno) can import.
//
// Why a bundle instead of importing the source directly?
//   The engine source uses TS NodeNext-style imports (`export * from './types.js'`)
//   that point at `.ts` files. Deno cannot resolve a `.js` specifier to a `.ts`
//   file. esbuild can — with the tiny onResolve plugin below that rewrites relative
//   `.js` specifiers back to `.ts` at bundle time. The emitted bundle is real JS
//   with all internal imports inlined, so Deno imports one file with zero surprises.
//
//   This keeps packages/game-engine completely untouched (pure, noEmit).

import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')

/** Rewrites relative `./foo.js` imports to `./foo.ts` when only the .ts exists. */
const jsToTsResolve = {
  name: 'js-to-ts-resolve',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.kind === 'entry-point') return undefined
      if (!args.path.startsWith('.')) return undefined // bare specifiers: leave alone
      const tsPath = resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'))
      return existsSync(tsPath) ? { path: tsPath } : undefined
    })
  },
}

await build({
  entryPoints: [resolve(pkgRoot, 'src/index.ts')],
  outfile: resolve(pkgRoot, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral', // no Node/Deno builtins assumed — pure logic only
  target: 'es2022',
  plugins: [jsToTsResolve],
})

console.log('✓ backend-core bundled → dist/index.js')
