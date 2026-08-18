import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // WARNING: CHANGE THESE CREDENTIALS BEFORE ANY NON-LOCAL USE
  const email = process.env.ADMIN_EMAIL || "admin@system.local";
  const password = process.env.ADMIN_PASSWORD || "password123";
  
  const existingUser = await prisma.user.findUnique({ where: { email } });
  
  if (existingUser) {
    console.log(`Admin user ${email} already exists. Updating role to ADMIN...`);
    await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" }
    });
    console.log("Done.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "ADMIN",
    }
  });
  
  console.log(`Admin user created!`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


