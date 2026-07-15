import { getRepository } from "@/lib/repository";
import type { RequestContext } from "@/lib/repository/repository";
import { generateEvidencePackage } from "@/lib/reporting/generate-package";

export async function generateReportWorkflow(input: {
  context: RequestContext;
  reportId: string;
}) {
  "use workflow";
  return buildReportStep(input);
}

async function buildReportStep(input: {
  context: RequestContext;
  reportId: string;
}) {
  "use step";
  const repository = await getRepository();
  const source = await repository.getReportSource(input.context, input.reportId);
  if (!source) throw new Error("REPORT_NOT_FOUND");
  try {
    const artifacts = await generateEvidencePackage(source);
    await repository.markReportReady(input.context, input.reportId, artifacts);
    return artifacts;
  } catch (error) {
    await repository.markReportFailed(
      input.context,
      input.reportId,
      error instanceof Error ? error.message : "Report generation failed",
    );
    throw error;
  }
}
