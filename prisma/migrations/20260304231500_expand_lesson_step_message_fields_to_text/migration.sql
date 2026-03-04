-- Expand lesson narrative/question fields to TEXT to avoid truncation errors during content seeding.
ALTER TABLE `LessonStep`
    MODIFY `beforeMessage` TEXT NULL,
    MODIFY `questionText` TEXT NULL,
    MODIFY `followUpMessage` TEXT NULL;
