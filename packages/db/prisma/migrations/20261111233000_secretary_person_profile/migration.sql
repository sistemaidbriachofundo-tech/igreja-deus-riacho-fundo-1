CREATE TYPE "PersonSex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

ALTER TABLE "persons"
    ADD COLUMN "birth_date" DATE,
    ADD COLUMN "baptism_date" DATE,
    ADD COLUMN "wedding_date" DATE,
    ADD COLUMN "first_attended_on" DATE,
    ADD COLUMN "sex" "PersonSex";
