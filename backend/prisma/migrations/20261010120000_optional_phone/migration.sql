-- Google/Apple accounts can be created without a phone number.
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
