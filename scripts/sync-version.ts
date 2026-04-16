import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SemverParts = {
  major: number;
  minor: number;
  patch: number;
};

function parseSemver(version: string): SemverParts {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unsupported package version "${version}". Expected semver (x.y.z).`);
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function updateFile(
  filePath: string,
  replacements: Array<[RegExp, string]>,
): Promise<boolean> {
  if (!(await fileExists(filePath))) return false;

  const source = await readFile(filePath, "utf-8");
  let output = source;
  for (const [pattern, value] of replacements) {
    output = output.replace(pattern, value);
  }

  if (output === source) return false;
  await writeFile(filePath, output, "utf-8");
  return true;
}

async function run() {
  const rootDir = path.resolve(import.meta.dirname, "..");
  const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8")) as { version?: string };
  const packageVersion = packageJson.version;

  if (!packageVersion) throw new Error("package.json is missing a version field.");

  const { major, minor, patch } = parseSemver(packageVersion);
  const buildNumber = major * 10000 + minor * 100 + patch;

  const androidPath = path.join(rootDir, "android/app/build.gradle");
  const iosPbxprojPath = path.join(rootDir, "ios/App/App.xcodeproj/project.pbxproj");

  const androidUpdated = await updateFile(androidPath, [
    [/versionCode\s+\d+/g, `versionCode ${buildNumber}`],
    [/versionName\s+"[^"]+"/g, `versionName "${packageVersion}"`],
  ]);

  const iosUpdated = await updateFile(iosPbxprojPath, [
    [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`],
    [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${packageVersion};`],
  ]);

  if (androidUpdated || iosUpdated) {
    console.log(
      `Synchronized platform versions from package.json (${packageVersion}, build ${buildNumber}).`,
    );
    return;
  }

  console.log(`Platform versions already synchronized to ${packageVersion} (build ${buildNumber}).`);
}

run().catch((error) => {
  console.error("[sync-version]", error instanceof Error ? error.message : error);
  process.exit(1);
});
