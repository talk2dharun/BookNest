-- Runs only the first time this Postgres volume is created.
-- Tests also create booknest_test if it is missing (init scripts do not re-run on existing volumes).
CREATE DATABASE booknest_test;
