ALTER TABLE "users" DROP COLUMN "mfa_enabled";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "totp_secret_encrypted";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "recovery_code_hashes";