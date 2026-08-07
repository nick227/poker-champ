-- CreateTable
-- Durable dedup ledger for Stripe webhook events (replaces the in-memory Set
-- previously used in apps/server/src/http/webhooks/stripe.ts, which is not
-- durable across process restarts). See StripeEvent model in schema.prisma.
CREATE TABLE `StripeEvent` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StripeEvent_eventId_key`(`eventId`),
    INDEX `StripeEvent_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
