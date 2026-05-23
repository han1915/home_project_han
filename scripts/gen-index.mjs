import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const clientDir = join(root, 'dist/client')
const serverAssetsDir = join(root, 'dist/server/assets')

const tssManifestFile = readdirSync(serverAssetsDir)
  .find(f => f.startsWith('_tanstack-start-manifest'))
if (!tssManifestFile) throw new Error('TanStack Start manifest not found in dist/server/assets/')

const tssManifest = readFileSync(join(serverAssetsDir, tssManifestFile), 'utf-8')
const clientEntryMatch = tssManifest.match(/clientEntry:\s*"([^"]+)"/)
if (!clientEntryMatch) throw new Error('clientEntry not found in TanStack Start manifest')
const clientEntry = clientEntryMatch[1]

const cssFile = readdirSync(join(clientDir, 'assets')).find(f => f.endsWith('.css'))
if (!cssFile) throw new Error('CSS file not found in dist/client/assets/')

const html = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HomeDirect — 데이터로 보는 부동산</title>
    <meta name="description" content="서울 주요 매물 실거래가와 사용자 행동 데이터를 한곳에서 확인하세요." />
    <link rel="stylesheet" crossorigin href="/assets/${cssFile}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${clientEntry}"></script>
  </body>
</html>
`

writeFileSync(join(clientDir, 'index.html'), html)
console.log('Generated dist/client/index.html')
console.log('  CSS :', `/assets/${cssFile}`)
console.log('  JS  :', clientEntry)
