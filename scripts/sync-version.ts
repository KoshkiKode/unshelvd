import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SemverParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

function parseSemver(version: string): SemverParts {
  // Accepts e.g. "1.2.3" or "0.1.0-beta" or "0.1.0-beta.2".
  // Prerelease grammar follows semver: dot-separated identifiers, each
  // alphanumeric/hyphen and non-empty. Rejects malformed inputs like
  // "1.0.0-" or "1.0.0-.beta" or "1.0.0-beta.".
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
  );
  if (!match) {
    throw new Error(`Unsupported package version "${version}". Expected semver (x.y.z[-prerelease]).`);
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ?? null,
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

  const { major, minor, patch, prerelease } = parseSemver(packageVersion);
  const buildNumber = major * 10000 + minor * 100 + patch;

  // Android `versionName` allows arbitrary strings, so we keep the full semver
  // including any prerelease tag (e.g. "0.1.0-beta") for visibility in the
  // Play Console internal track.
  const androidVersionName = packageVersion;

  // iOS `MARKETING_VERSION` (CFBundleShortVersionString) MUST be three numeric
  // segments separated by periods — Apple rejects values like "0.1.0-beta" at
  // App Store Connect upload time. Strip the prerelease tag for iOS only and
  // use `CURRENT_PROJECT_VERSION` (CFBundleVersion) to differentiate beta
  // builds via the integer build number.
  const iosMarketingVersion = `${major}.${minor}.${patch}`;

  const androidPath = path.join(rootDir, "android/app/build.gradle");
  const iosPbxprojPath = path.join(rootDir, "ios/App/App.xcodeproj/project.pbxproj");

  const androidUpdated = await updateFile(androidPath, [
    [/versionCode\s+\d+/g, `versionCode ${buildNumber}`],
    [/versionName\s+"[^"]+"/g, `versionName "${androidVersionName}"`],
  ]);

  const iosUpdated = await updateFile(iosPbxprojPath, [
    [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`],
    [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${iosMarketingVersion};`],
  ]);

  if (androidUpdated || iosUpdated) {
    const prereleaseNote = prerelease ? ` (iOS marketing version "${iosMarketingVersion}" — prerelease tag stripped for App Store Connect compatibility)` : "";
    console.log(
      `Synchronized platform versions from package.json (${packageVersion}, build ${buildNumber})${prereleaseNote}.`,
    );
    return;
  }

  console.log(`Platform versions already synchronized to ${packageVersion} (build ${buildNumber}).`);
}

run().catch((error) => {
  console.error("[sync-version]", error instanceof Error ? error.message : error);
  process.exit(1);
});
