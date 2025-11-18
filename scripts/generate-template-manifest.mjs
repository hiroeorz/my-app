import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const templatesDir = path.resolve(projectRoot, "templates")
const generatedDir = path.resolve(projectRoot, "src/generated")
const outputFile = path.resolve(generatedDir, "template-assets.ts")

async function collectTemplateFiles(dir = templatesDir, acc = []) {
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return acc
    }
    throw error
  }

  for (const entry of entries) {
    const absolutePath = path.resolve(dir, entry.name)
    if (entry.isDirectory()) {
      await collectTemplateFiles(absolutePath, acc)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith(".erb")) {
      continue
    }

    const relativePath = path.relative(generatedDir, absolutePath).replace(/\\/g, "/")
    const projectRelativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, "/")
    acc.push({
      importPath: relativePath.startsWith(".") ? relativePath : `./${relativePath}`,
      projectRelativePath,
    })
  }

  return acc
}

function buildFileContents(templateFiles) {
  const sortedFiles = templateFiles.sort((a, b) =>
    a.projectRelativePath.localeCompare(b.projectRelativePath),
  )

  const importLines = sortedFiles
    .map((file, index) => `import template${index} from "${file.importPath}"`)
    .join("\n")

  const header =
    'import { setTemplateAssets, type TemplateAsset } from "@hibana-apps/runtime"\n' +
    (importLines ? `${importLines}\n\n` : "\n")

  const entries =
    sortedFiles.length === 0
      ? ""
      : sortedFiles
          .map(
            (file, index) =>
              `  { filename: "${file.projectRelativePath}", source: template${index} },`,
          )
          .join("\n")

  return `${header}const templateAssets: TemplateAsset[] = [
${entries}
]

setTemplateAssets(templateAssets)

export { templateAssets }
`
}

async function main() {
  const templates = await collectTemplateFiles()
  const contents = buildFileContents(templates)

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
  console.error("[generate-template-manifest] Failed to generate template manifest:", error)
  process.exitCode = 1
})
