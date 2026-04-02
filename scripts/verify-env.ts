/**
 * Unshelv'd — Environment Verification Script
 * 
 * Runs before builds to ensure all necessary environment variables 
 * are set for the target platform (Web, Android, iOS).
 */

import { existsSync } from "fs";

const target = process.env.VITE_TARGET || "web";
const isProduction = process.env.NODE_ENV === "production";

console.log(`\n🔍 Verifying environment for target: ${target} [${isProduction ? "PROD" : "DEV"}]`);

const errors: string[] = [];

// 1. Check for VITE_API_URL on native platforms
if (target === "android" || target === "ios") {
  if (!process.env.VITE_API_URL) {
    errors.push(`❌ VITE_API_URL is missing! Native apps MUST have a production API URL baked in.`);
  } else if (!process.env.VITE_API_URL.startsWith("http")) {
    errors.push(`❌ VITE_API_URL must be an absolute URL (starting with http/https).`);
  }
}

// 2. Check for SESSION_SECRET in production
if (isProduction && !process.env.SESSION_SECRET) {
  console.warn(`⚠️  WARNING: SESSION_SECRET is not set. Using default (not secure for production).`);
}

// 3. Database check (optional but helpful)
if (isProduction && !process.env.DATABASE_URL) {
  errors.push(`❌ DATABASE_URL is missing! The server will not be able to connect to the database.`);
}

if (errors.length > 0) {
  console.error("\n❌ PRE-BUILD VERIFICATION FAILED:");
  errors.forEach(err => console.error(`  ${err}`));
  console.log("\nPlease set the required environment variables and try again.");
  process.exit(1);
}

console.log("✅ Environment verification passed.\n");
process.exit(0);
