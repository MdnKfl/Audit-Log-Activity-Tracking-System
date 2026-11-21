import { z } from 'zod';

// HTTP input schemas for registration, login profile changes, and password resets.
// Normalize email once at the API boundary so uniqueness checks are case-insensitive in practice.
export const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());

export const passwordSchema = z.string().min(12).refine(
  (password) => new TextEncoder().encode(password).length <= 72,
  'Password must be at most 72 UTF-8 bytes',
);

const profileSchema = {
  fullName: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(500),
  phoneNumber: z.string().trim().min(5).max(30),
  email: emailSchema,
};

export const createUserSchema = z.object({
  ...profileSchema,
  password: passwordSchema,
});

export const updateUserSchema = z.object(profileSchema).partial().refine(
  (data) => Object.keys(data).length > 0,
  'Provide at least one field to update',
);

export const resetPasswordSchema = z.object({ password: passwordSchema });

export const userIdSchema = z.string().uuid();
