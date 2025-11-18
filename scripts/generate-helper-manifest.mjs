import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const helpersDir = path.resolve(projectRoot, "app/helpers")
const generatedDir = path.resolve(projectRoot, "src/generated")
const outputFile = path.resolve(generatedDir, "helper-scripts.ts")

async function collectHelperFiles() {
  try {
    const entries = await fs.readdir(helpersDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".rb"))
      .map((entry) => {
        const absolutePath = path.resolve(helpersDir, entry.name)
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

function buildFileContents(helperFiles) {
  const importLines = helperFiles
    .map((file, index) => `import helper${index} from "${file.importPath}"`)
    .join("\n")

  const header =
    'import { setHelperScripts, type HelperScript } from "@hibana-apps/runtime"\n' +
    (importLines ? `${importLines}\n\n` : "\n")

  const arrayEntries =
    helperFiles.length === 0
      ? ""
      : helperFiles
          .map(
            (file, index) =>
              `  { filename: "${file.projectRelativePath}", source: helper${index} },`,
          )
          .join("\n")

  return `${header}const helperScripts: HelperScript[] = [
${arrayEntries}
]

setHelperScripts(helperScripts)

export { helperScripts }
`
}

async function main() {
  const helperFiles = await collectHelperFiles()
  const contents = buildFileContents(helperFiles)

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
  console.error("[generate-helper-manifest] Failed to generate helper manifest:", error)
  process.exitCode = 1
})
