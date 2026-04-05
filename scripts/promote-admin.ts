/**
 * Simple script to promote a user to an admin role.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/promote-admin.ts <user_email>
 */
import { db } from "../server/storage";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("❌ Please provide the user's email address as an argument.");
    process.exit(1);
  }

  console.log(`Searching for user: ${email}...`);

  const user = await db.select().from(users).where(eq(users.email, email));

  if (!user.length) {
    console.error(`❌ User with email "${email}" not found.`);
    process.exit(1);
  }

  console.log(`Found user: ${user[0].username} (ID: ${user[0].id}). Promoting to admin...`);

  await db.update(users).set({ role: "admin" }).where(eq(users.id, user[0].id));

  console.log(`✅ User ${user[0].username} has been promoted to admin.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("An error occurred:", err);
  process.exit(1);
});
