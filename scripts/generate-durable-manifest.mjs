import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const durableDir = path.resolve(projectRoot, "app", "durable")
const generatedDir = path.resolve(projectRoot, "src", "generated")
const outputFile = path.resolve(generatedDir, "durable-manifest.ts")

async function readDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

async function walkDurableFiles(dir) {
  const entries = await readDirSafe(dir)
  const files = []
  for (const entry of entries) {
    const absolute = path.resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkDurableFiles(absolute)))
    } else if (entry.isFile() && entry.name.endsWith(".rb")) {
      files.push(absolute)
    }
  }
  return files
}

function extractClassName(source, filePath) {
  const match = source.match(/class\s+([A-Za-z0-9_:]+)/)
  if (!match) {
    throw new Error(`Failed to detect Durable Object class name in ${filePath}`)
  }
  return match[1]
}

function extractBindingName(source, filePath) {
  const registerRegex =
    /Hibana::DurableObjects\.register\s*(?:\(|\s)\s*(?::([A-Za-z0-9_]+)|["']([A-Za-z0-9_]+)["'])/m
  const match = source.match(registerRegex)
  if (!match) {
    throw new Error(`Failed to detect Hibana::DurableObjects.register binding in ${filePath}`)
  }
  return match[1] ?? match[2]
}

function sanitizeExportName(className) {
  const sanitized = className.replace(/::/g, "")
  if (!/^[$A-Za-z_][$A-Za-z0-9_]*$/.test(sanitized)) {
    throw new Error(
      `Class name '${className}' cannot be converted to a valid export identifier (got '${sanitized}')`,
    )
  }
  return sanitized
}

async function collectDurableEntries() {
  const files = await walkDurableFiles(durableDir)
  const entries = []
  for (const absolutePath of files) {
    const source = await fs.readFile(absolutePath, "utf8")
    const className = extractClassName(source, absolutePath)
    const binding = extractBindingName(source, absolutePath)
    const exportName = sanitizeExportName(className)
    const projectRelativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, "/")
    const relativeToGenerated = path.relative(generatedDir, absolutePath).replace(/\\/g, "/")
    const importPath =
      relativeToGenerated.startsWith(".") || relativeToGenerated.startsWith("/")
        ? relativeToGenerated
        : `./${relativeToGenerated}`
    entries.push({
      className,
      binding,
      exportName,
      projectRelativePath,
      importPath,
    })
  }
  return entries.sort((a, b) => a.projectRelativePath.localeCompare(b.projectRelativePath))
}

function buildFileContents(entries) {
  const lines = []
  lines.push('import type { RubyScript } from "@hibana-apps/runtime"')
  if (entries.length > 0) {
    lines.push('import { createDurableObjectClass } from "@hibana-apps/runtime"')
  }
  entries.forEach((entry, index) => {
    lines.push(`import durableScript${index} from "${entry.importPath}"`)
  })

  lines.push("")
  lines.push("export const durableScripts: RubyScript[] = [")
  if (entries.length > 0) {
    entries.forEach((entry, index) => {
      lines.push(
        `  { filename: "${entry.projectRelativePath}", source: durableScript${index} },`,
      )
    })
  }
  lines.push("]")
  lines.push("")

  if (entries.length > 0) {
    lines.push("export const durableObjectBindings = [")
    entries.forEach((entry) => {
      lines.push(
        `  { binding: "${entry.binding}", className: "${entry.className}", exportName: "${entry.exportName}" },`,
      )
    })
    lines.push("] as const")
    lines.push("")
    entries.forEach((entry) => {
      lines.push(
        `export const ${entry.exportName} = createDurableObjectClass("${entry.binding}")`,
      )
    })
  } else {
    lines.push("export const durableObjectBindings = [] as const")
  }
  lines.push("")
  return `${lines.join("\n")}`
}

async function main() {
  const entries = await collectDurableEntries()
  const contents = buildFileContents(entries)
  await fs.mkdir(generatedDir, { recursive: true })

  let existing = null
  try {
    existing = await fs.readFile(outputFile, "utf8")
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error
    }
  }

  if (existing !== contents) {
    await fs.writeFile(outputFile, contents, "utf8")
  }
}

main().catch((error) => {
  console.error("[generate-durable-manifest] Failed to generate durable manifest:", error)
  process.exitCode = 1
})
