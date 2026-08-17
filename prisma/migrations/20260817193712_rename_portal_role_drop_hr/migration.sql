-- Rename PortalRole enum values to match PRD v1.0 role naming, drop HR (no
-- corresponding PRD role; PF-02 org-wide read now belongs to ADMIN only).
--
-- Any existing PortalUser row with role = 'HR' must be reassigned or removed
-- before this runs, since HR is dropped from the enum entirely.
DELETE FROM "portal_users" WHERE role = 'HR';

ALTER TYPE "PortalRole" RENAME VALUE 'MANAGER' TO 'DEPARTMENT_MANAGER';
ALTER TYPE "PortalRole" RENAME VALUE 'CONTENT_MANAGER' TO 'CONTENT_CREATOR';
ALTER TYPE "PortalRole" RENAME TO "PortalRole_old";

CREATE TYPE "PortalRole" AS ENUM ('DEPARTMENT_MANAGER', 'CONTENT_CREATOR', 'ADMIN');

ALTER TABLE "portal_users" ALTER COLUMN "role" TYPE "PortalRole" USING ("role"::text::"PortalRole");
ALTER TABLE "portal_invites" ALTER COLUMN "role" TYPE "PortalRole" USING ("role"::text::"PortalRole");

DROP TYPE "PortalRole_old";
