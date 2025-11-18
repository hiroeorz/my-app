import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const modelsDir = path.resolve(projectRoot, "app/models")
const generatedDir = path.resolve(projectRoot, "src/generated")
const outputFile = path.resolve(generatedDir, "model-scripts.ts")

async function collectModelFiles() {
  try {
    const entries = await fs.readdir(modelsDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".rb"))
      .map((entry) => {
        const absolutePath = path.resolve(modelsDir, entry.name)
        const relativePath = path
          .relative(generatedDir, absolutePath)
          .replace(/\\/g, "/")
        const projectRelativePath = path
          .relative(projectRoot, absolutePath)
          .replace(/\\/g, "/")
        return {
          filename: entry.name,
          importPath: relativePath.startsWith(".") ? relativePath : `./${relativePath}`,
          projectRelativePath,
        }
      })
      .sort((a, b) => a.filename.localeCompare(b.filename))
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

function buildFileContents(modelFiles) {
  const importLines = modelFiles
    .map((file, index) => `import model${index} from "${file.importPath}"`)
    .join("\n")

  const header =
    'import type { RubyScript } from "@hibana-apps/runtime"\n' +
    (importLines ? `${importLines}\n\n` : "\n")

  const arrayEntries =
    modelFiles.length === 0
      ? ""
      : modelFiles
          .map(
            (file, index) =>
              `  { filename: "${file.projectRelativePath}", source: model${index} },`,
          )
          .join("\n")

  return `${header}const modelScripts: RubyScript[] = [
${arrayEntries}
]

export default modelScripts
export { modelScripts }
`
}

async function main() {
  const modelFiles = await collectModelFiles()
  const contents = buildFileContents(modelFiles)

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
  console.error("[generate-model-manifest] Failed to generate model manifest:", error)
  process.exitCode = 1
})
