-- AlterTable
-- Adds claim-state tracking to StripeEvent so a claim row can distinguish
-- "actively being processed" from "abandoned mid-flight by a crash" instead
-- of existence alone being used as a duplicate-processing proxy. See
-- claimStripeEvent in apps/server/src/http/webhooks/stripe.ts for the
-- reclaim logic this enables.
ALTER TABLE `StripeEvent` ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `processingStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'claimed';

-- CreateIndex
CREATE INDEX `StripeEvent_status_processingStartedAt_idx` ON `StripeEvent`(`status`, `processingStartedAt`);
