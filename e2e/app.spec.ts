import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("shows the daily care workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Daily care log", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /today’s routine/i })).toBeVisible();
  await expect(page.getByText(/local demo workspace/i)).toBeVisible();
});

test("primary pages have no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
});

test("owner can complete the auditable record lifecycle", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Run the stateful lifecycle once on desktop Chromium.");
  test.setTimeout(90_000);

  const marker = Date.now().toString();
  const appointmentStatuses = ["attended", "late", "missed"] as const;
  const observation = `At 4:05 PM, water was observed on the tile beside the bathtub. Test ${marker}.`;
  const correctedObservation = `${observation} A towel was placed on the tile at 4:07 PM.`;
  const attachmentName = `safety-note-${marker}.png`;

  await page.goto("/");
  await page.getByRole("button", { name: /^Time together/ }).click();
  await expect(page.getByRole("heading", { name: "Time together" })).toBeVisible();
  await page.getByText("Parent B", { exact: true }).click();
  await page.getByLabel("Duration in minutes").fill("45");
  await page.getByLabel("Activity type").fill("Reading and homework");
  await page.getByLabel("Factual notes (optional)").fill(`Both children read at the kitchen table. Test ${marker}.`);
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("heading", { name: "Time together" })).not.toBeVisible();

  await page.goto("/appointments");
  for (const status of appointmentStatuses) {
    const title = `${status[0].toUpperCase()}${status.slice(1)} appointment ${marker}`;
    await page.getByRole("button", { name: "Add appointment" }).click();
    await page.getByRole("textbox", { name: "Appointment", exact: true }).fill(title);
    await page.getByRole("button", { name: status, exact: true }).click();
    await page.getByLabel("Factual notes (optional)").fill(`Attendance outcome recorded as ${status}.`);
    await page.getByRole("button", { name: "Save appointment" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }

  await page.goto("/incidents");
  await page.getByRole("button", { name: "Add incident" }).click();
  await page.getByLabel("Location (optional)").fill("Upstairs bathroom");
  await page.getByLabel("People present").fill("Parent A, Parent B");
  await page.getByLabel("Other witnesses").fill("None");
  await page.getByLabel("What was directly observed?").fill(observation);
  await page.getByLabel("Immediate actions").fill("A towel was placed over the wet area.");
  await page.getByLabel("Outcome").fill("The floor was dry when checked again at 4:12 PM.");
  await page.locator('input[type="file"]').setInputFiles({
    name: attachmentName,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Save factual record" }).click();
  await expect(page.getByText(observation, { exact: true })).toBeVisible();

  const incidentCard = page.locator('[data-slot="card"]').filter({ hasText: observation });
  await incidentCard.getByRole("button", { name: "Correct" }).click();
  await page.getByLabel("Corrected factual text").fill(correctedObservation);
  await page.getByLabel("Reason for correction").fill("Added the directly observed response time.");
  await page.getByRole("button", { name: "Append correction" }).click();
  await expect(page.getByRole("main").getByText(correctedObservation, { exact: true })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Finalize day" }).click();
  await expect(page.getByText("Finalized", { exact: true })).toBeVisible();

  await page.goto("/timeline");
  await page.getByLabel("Search timeline").fill("water was observed");
  const timelineCard = page.locator('[data-slot="card"]').filter({ hasText: correctedObservation });
  const attachmentHref = await timelineCard.getByRole("link", { name: attachmentName }).getAttribute("href");
  expect(attachmentHref).toBeTruthy();
  await timelineCard.getByRole("button", { name: "History (2)" }).click();
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
  await expect(page.getByText(/SHA-256:/).first()).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/reports");
  await page.getByRole("button", { name: "Create report" }).click();
  await page.getByRole("button", { name: "Generate package" }).click();
  const pdfLink = page.getByRole("link", { name: "PDF" }).first();
  const zipLink = page.getByRole("link", { name: "Evidence ZIP" }).first();
  await expect(pdfLink).toBeVisible({ timeout: 30_000 });
  const pdfHref = await pdfLink.getAttribute("href");
  const zipHref = await zipLink.getAttribute("href");
  expect(pdfHref).toBeTruthy();
  expect(zipHref).toBeTruthy();
  const pdfResponse = await request.get(pdfHref!);
  const zipResponse = await request.get(zipHref!);
  expect(pdfResponse.ok()).toBe(true);
  expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect(zipResponse.ok()).toBe(true);
  expect(Array.from((await zipResponse.body()).subarray(0, 2))).toEqual([80, 75]);

  await page.goto("/settings");
  await expect(page.getByLabel("Display name")).toHaveCount(2);
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(2);
  await page.getByLabel("Routine label").first().fill(`Morning wake-up ${marker}`);
  await page.getByRole("switch", { name: "Allow permanent deletion" }).click();
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();

  const reviewerName = `Attorney ${marker}`;
  await page.getByLabel("Reviewer name").fill(reviewerName);
  await page.getByLabel("Email").fill(`attorney-${marker}@example.com`);
  await page.getByRole("button", { name: "Invite reviewer" }).click();
  await expect(page.getByText("Reviewer invitation created.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(reviewerName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Revoke ${reviewerName}` }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();

  await page.goto("/timeline");
  await page.getByLabel("Search timeline").fill("water was observed");
  const purgeCard = page.locator('[data-slot="card"]').filter({ hasText: correctedObservation });
  await purgeCard.getByRole("button", { name: "Purge" }).click();
  await page.getByLabel("Reason for deletion").fill("Permanent deletion requested for the automated lifecycle test.");
  await page.getByLabel("Type PERMANENTLY DELETE").fill("PERMANENTLY DELETE");
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await expect(page.getByText("No records match these filters.", { exact: true })).toBeVisible();
  expect((await request.get(attachmentHref!)).status()).toBe(404);

  await page.goto("/reports");
  await expect(page.getByText("No report snapshots yet", { exact: true })).toBeVisible();
});
