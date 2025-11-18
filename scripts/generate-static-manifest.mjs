import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const publicDir = path.resolve(projectRoot, "public")
const generatedDir = path.resolve(projectRoot, "src/generated")
const outputFile = path.resolve(generatedDir, "static-assets.ts")

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=UTF-8"
    case ".css":
      return "text/css; charset=UTF-8"
    case ".js":
      return "application/javascript; charset=UTF-8"
    case ".json":
      return "application/json; charset=UTF-8"
    case ".svg":
      return "image/svg+xml"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    default:
      return undefined
  }
}

async function collectAssets(dir = publicDir, list = []) {
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return list
    }
    throw error
  }

  for (const entry of entries) {
    const absolutePath = path.resolve(dir, entry.name)
    if (entry.isDirectory()) {
      await collectAssets(absolutePath, list)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, "/")
    const body = await fs.readFile(absolutePath, "utf-8")
    const servePath = path.relative(publicDir, absolutePath).replace(/\\/g, "/")
    list.push({
      filename: servePath,
      body,
      contentType: guessContentType(relativePath),
    })
  }

  return list
}

function buildFileContents(assets) {
  const sorted = assets.sort((a, b) => a.filename.localeCompare(b.filename))
  const header =
    'import { setStaticAssets, type StaticAsset } from "@hibana-apps/runtime"\n\n'

  const entries =
    sorted.length === 0
      ? ""
      : sorted
          .map((asset) => {
            const typeLine = asset.contentType
              ? `, contentType: "${asset.contentType}"`
              : ""
            const bodyLiteral = JSON.stringify(asset.body)
            return `  { filename: "${asset.filename}", body: ${bodyLiteral}${typeLine} },`
          })
          .join("\n")

  return `${header}const staticAssets: StaticAsset[] = [
${entries}
]

setStaticAssets(staticAssets)

export { staticAssets }
`
}

async function main() {
  const assets = await collectAssets()
  const contents = buildFileContents(assets)

  await fs.mkdir(generatedDir, { recursive: true })

  let current = null
  try {
    current = await fs.readFile(outputFile, "utf-8")
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error
    }
  }

  if (current !== contents) {
    await fs.writeFile(outputFile, contents, "utf-8")
  }
}

main().catch((error) => {
  console.error("[generate-static-manifest] Failed to generate static manifest:", error)
  process.exitCode = 1
})
