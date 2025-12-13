#!/usr/bin/env ts-node

/**
 * Migration Script for Workflow Tracking
 * 
 * This script migrates existing CitationCheck records to the new
 * extended schema with workflow tracking fields.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-workflows.ts [options]
 * 
 * Options:
 *   --file-id <id>     Migrate checks for a specific file
 *   --check-id <id>    Migrate a specific check
 *   --all              Migrate all checks (use with caution)
 *   --dry-run          Show what would be migrated without making changes
 */

import { PrismaClient } from "@prisma/client";
import { migrateCitationCheck, migrateFileChecks, migrateAllChecks } from "@/lib/migration/workflow-migration";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const migrateAll = args.includes("--all");
  
  const fileIdIndex = args.indexOf("--file-id");
  const checkIdIndex = args.indexOf("--check-id");
  
  const fileId = fileIdIndex >= 0 ? args[fileIdIndex + 1] : null;
  const checkId = checkIdIndex >= 0 ? args[checkIdIndex + 1] : null;
  
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");
  }
  
  try {
    if (checkId) {
      // Migrate specific check
      console.log(`Migrating check: ${checkId}`);
      if (!dryRun) {
        const result = await migrateCitationCheck(prisma, checkId);
        console.log(result.migrated ? "✅ Migrated" : "⏭️  Already migrated or no data");
        console.log("Check:", JSON.stringify(result.check, null, 2));
      } else {
        const check = await prisma.citationCheck.findUnique({
          where: { id: checkId },
        });
        if (check) {
          console.log("Would migrate:", check.id);
          console.log("Current workflowType:", check.workflowType || "null");
        } else {
          console.log("❌ Check not found");
        }
      }
    } else if (fileId) {
      // Migrate all checks for a file
      console.log(`Migrating checks for file: ${fileId}`);
      if (!dryRun) {
        const result = await migrateFileChecks(prisma, fileId);
        console.log(`✅ Migrated ${result.migrated} checks`);
        console.log(`⏭️  Skipped ${result.skipped} checks`);
        console.log(`📊 Total: ${result.total} checks`);
      } else {
        const checks: any[] = await prisma.citationCheck.findMany({
          where: { fileUploadId: fileId },
        });
        console.log(`Would migrate ${checks.length} checks`);
        checks.forEach(check => {
          console.log(`  - ${check.id}: ${check.workflowType || "null"}`);
        });
      }
    } else if (migrateAll) {
      // Migrate all checks
      console.log("Migrating all checks...");
      if (!dryRun) {
        const result = await migrateAllChecks(prisma);
        console.log(`✅ Migration complete!`);
        console.log(`📊 Total: ${result.total}`);
        console.log(`✅ Migrated: ${result.migrated}`);
        console.log(`⏭️  Skipped: ${result.skipped}`);
        console.log(`❌ Errors: ${result.errors}`);
      } else {
        const count = await prisma.citationCheck.count({
          where: { workflowType: null },
        });
        console.log(`Would migrate ${count} checks`);
      }
    } else {
      console.log("Usage:");
      console.log("  --check-id <id>    Migrate a specific check");
      console.log("  --file-id <id>     Migrate checks for a specific file");
      console.log("  --all              Migrate all checks");
      console.log("  --dry-run          Show what would be migrated");
    }
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

