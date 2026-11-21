import 'dotenv/config';
import { ZodError } from 'zod';
import { prisma } from '../infrastructure/database/main.client';
import { hashPassword } from '../security/password';
import { emailSchema, passwordSchema } from '../validators/user.validator';

/** Creates the first SUPERADMIN or restores its credentials from the protected environment settings. */
async function main() {
  const email = emailSchema.parse(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const password = passwordSchema.parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const passwordHash = await hashPassword(password);

  // Running this command again intentionally restores this superadmin's configured password and role.
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

// Report configuration failures without printing secrets and always disconnect Prisma before exiting.
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
