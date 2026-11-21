import { z } from 'zod';

// HTTP input schemas for registration, login profile changes, and password resets.
// Normalize email once at the API boundary so uniqueness checks are case-insensitive in practice.
/** Validates and normalizes email before uniqueness checks or account lookup. */
export const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
/** Validates admin login names and normalizes them so case variants share one account identity. */
export const usernameSchema = z.string().trim().min(3).max(32)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may contain letters, numbers, dots, underscores, and hyphens')
  .transform((username) => username.toLowerCase());

/** Applies password length rules before hashing; the byte limit matches bcrypt's input limit. */
export const passwordSchema = z.string().min(12).refine(
  (password) => new TextEncoder().encode(password).length <= 72,
  'Password must be at most 72 UTF-8 bytes',
);

// Fields every public user must provide when registering.
const profileSchema = {
  fullName: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(500),
  phoneNumber: z.string().trim().min(5).max(30),
  email: emailSchema,
};

/** Request body for public registration and admin-created regular users. */
export const createUserSchema = z.object({
  ...profileSchema,
  password: passwordSchema,
});

/** Request body for superadmin-created admin accounts; username replaces required email for login. */
export const createAdminSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  username: usernameSchema,
  email: emailSchema.optional(),
  address: z.string().trim().min(1).max(500).optional(),
  phoneNumber: z.string().trim().min(5).max(30).optional(),
  password: passwordSchema,
});

/** Allows admins to change selected profile/login fields while rejecting empty PATCH requests. */
export const updateUserSchema = z.object({ ...profileSchema, username: usernameSchema }).partial().refine(
  (data) => Object.keys(data).length > 0,
  'Provide at least one field to update',
);

/** Reuses the password rules for admin-initiated password resets. */
export const resetPasswordSchema = z.object({ password: passwordSchema });

/** Ensures path parameters identify a user by UUID before a repository query runs. */
export const userIdSchema = z.string().uuid();
