import 'dotenv/config';
import { ZodError } from 'zod';
import { prisma } from '../infrastructure/database/main.client';
import { hashPassword } from '../security/password';
import { emailSchema, passwordSchema } from '../validators/user.validator';

async function main() {
  const email = emailSchema.parse(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const password = passwordSchema.parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const passwordHash = await hashPassword(password);

  // Running this command again intentionally resets this admin's password to the configured value.
  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      fullName: 'Super Administrator',
      address: null,
      phoneNumber: null,
      email,
      passwordHash,
      role: 'SUPERADMIN',
    },
    update: { passwordHash, role: 'SUPERADMIN' },
    select: { id: true, email: true, role: true },
  });
  console.log(`Superadmin account is ready (${admin.role}).`);
}

void main()
  .catch((error) => {
    if (error instanceof ZodError) {
      console.error('Invalid bootstrap administrator settings:', error.issues.map(({ path, message }) => ({ path, message })));
    } else {
      console.error('Could not bootstrap administrator:', error);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
