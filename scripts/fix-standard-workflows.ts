#!/usr/bin/env ts-node

/**
 * Fix Standard Workflow Classification
 * 
 * This script finds checks that should be "standard" workflow but are
 * incorrectly classified (or null) and updates them to "standard".
 * 
 * A check should be "standard" if:
 * - It has validation (status = "citations_validated" or has validate-citations in completedSteps)
 * - It does NOT have testRunId or heavyAnalysisRunId in metadata
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixStandardWorkflows() {
  console.log("Finding checks that should be standard workflow...\n");

  // Find all checks that have validation
  const allChecks = await prisma.citationCheck.findMany({
    where: {
      OR: [
        { status: "citations_validated" },
        { citationCount: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      fileUploadId: true,
      version: true,
      status: true,
      workflowType: true,
      citationCount: true,
      completedSteps: true,
      jsonData: true,
    },
  });

  console.log(`Total checks with validation: ${allChecks.length}`);

  // Filter to find checks that should be standard but aren't
  const checksToFix: Array<{ id: string; currentType: string | null; shouldBe: string }> = [];

  for (const check of allChecks) {
    const jsonData = check.jsonData as any;
    const metadata = jsonData?.document?.metadata;
    
    const hasTestRun = metadata?.testRunId;
    const hasHeavyAnalysis = metadata?.heavyAnalysisRunId;
    
    // Should be standard if it doesn't have testRunId or heavyAnalysisRunId
    const shouldBeStandard = !hasTestRun && !hasHeavyAnalysis;
    
    // Current workflowType
    const currentType = check.workflowType;
    
    // Check if it needs fixing
    if (shouldBeStandard && currentType !== "standard") {
      checksToFix.push({
        id: check.id,
        currentType,
        shouldBe: "standard",
      });
    }
  }

  console.log(`\nChecks that need to be fixed: ${checksToFix.length}`);

  if (checksToFix.length === 0) {
    console.log("No checks need fixing!");
    await prisma.$disconnect();
    return;
  }

  // Show sample
  console.log("\nSample checks to fix:");
  checksToFix.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.id}: ${c.currentType || "null"} → ${c.shouldBe}`);
  });

  // Ask for confirmation (in real script, you'd use readline)
  console.log(`\nWill update ${checksToFix.length} checks to workflowType: "standard"`);

  // Update checks
  let updated = 0;
  let errors = 0;

  for (const checkToFix of checksToFix) {
    try {
      // Get the check's jsonData to extract workflow info
      const check = await prisma.citationCheck.findUnique({
        where: { id: checkToFix.id },
        select: { jsonData: true, id: true },
      });

      if (!check || !check.jsonData) {
        console.warn(`Skipping ${checkToFix.id}: no jsonData`);
        continue;
      }

      const jsonData = check.jsonData as any;
      const metadata = jsonData?.document?.metadata;

      // Update to standard workflow
      await prisma.citationCheck.update({
        where: { id: checkToFix.id },
        data: {
          workflowType: "standard",
          workflowId: checkToFix.id, // Use check ID as workflow ID for standard
          documentMetadata: metadata || null,
          citationCount: jsonData?.document?.citations?.length || null,
          identificationMethod: metadata?.identificationMethod || null,
        },
      });

      updated++;
    } catch (error) {
      console.error(`Error updating check ${checkToFix.id}:`, error);
      errors++;
    }
  }

  console.log(`\n✅ Updated ${updated} checks`);
  if (errors > 0) {
    console.log(`❌ Errors: ${errors}`);
  }

  await prisma.$disconnect();
}

// Run if called directly
if (require.main === module) {
  fixStandardWorkflows()
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

export { fixStandardWorkflows };

