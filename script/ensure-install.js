import { createRequire } from "module";

const require = createRequire(import.meta.url);
const packages = process.argv.slice(2);

if (packages.length === 0) {
  process.exit(0);
}

const missingPackages = packages.filter((packageName) => {
  try {
    require.resolve(packageName);
    return false;
  } catch {
    return true;
  }
});

if (missingPackages.length > 0) {
  console.error(
    `Missing npm dependencies: ${missingPackages.join(", ")}.`
  );
  console.error("Run `npm install` or `npm ci` from the repo root, then rerun this command.");
  process.exit(1);
}