import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("shows the daily care workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Daily care log", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /today’s routine/i })).toBeVisible();
  await expect(page.getByText(/local demo workspace/i)).toBeVisible();
  await expect(page.getByLabel("Next day")).toBeDisabled();
});

test("mobile dashboard content stays within the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "This regression targets the narrow mobile layout.");

  await page.goto("/");
  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visibleElements = Array.from(
      document.querySelectorAll<HTMLElement>("main, main [data-slot='card'], main section button"),
    );

    return {
      viewportWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflowingElements: visibleElements
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < -0.5 || bounds.right > viewportWidth + 0.5;
        })
        .map((element) => ({
          tag: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
          bounds: element.getBoundingClientRect().toJSON(),
        })),
    };
  });

  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(layout.overflowingElements).toEqual([]);
});

test("primary pages have no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
});

test("shows saved routine changes on Today", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Run the stateful settings check once on desktop Chromium.");
  const marker = Date.now().toString();

  await page.goto("/");
  const dateInput = page.getByRole("textbox", { name: "Log date", exact: true });
  const today = await dateInput.inputValue();
  const [year, month, day] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  await dateInput.fill(previous);
  await expect(page.getByRole("textbox", { name: "Log date", exact: true })).toHaveValue(previous);
  await page.getByRole("link", { name: "Settings" }).click();
  const firstRoutine = page.getByLabel("Routine label").first();
  const originalLabel = await firstRoutine.inputValue();
  const updatedLabel = `${originalLabel} ${marker}`;
  await firstRoutine.fill(updatedLabel);
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByText(updatedLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(originalLabel, { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Log date", exact: true }).fill(previous);
  await expect(page.getByText(updatedLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(originalLabel, { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Routine label").first().fill(originalLabel);
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Reviewers", exact: true })).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveCount(1);
  await expect(page.getByLabel("Birthdate")).toHaveCount(1);
  const childName = `Child ${marker}`;
  await page.getByRole("button", { name: "Add child" }).click();
  await page.getByLabel("Display name").last().fill(childName);
  await page.getByLabel("Birthdate").last().fill("2020-01-15");
  await expect(page.getByText(/years old/).last()).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "IANA timezone" })).toBeVisible();
  const caregiverName = `Grandparent ${marker}`;
  await page.getByRole("button", { name: "Add caregiver" }).click();
  await page.getByLabel("Name", { exact: true }).last().fill(caregiverName);
  await page.getByRole("combobox", { name: "Relationship" }).last().click();
  await page.getByRole("option", { name: "Grandparent", exact: true }).click();
  const removedRoutineLabel = await page.getByLabel("Routine label").first().inputValue();
  await page.getByRole("button", { name: `Remove ${removedRoutineLabel}` }).click();
  await page.getByRole("button", { name: "Add routine item" }).click();
  await page.getByLabel("Routine label").last().fill(`Evening walk ${marker}`);
  await page.getByRole("switch", { name: "Allow permanent deletion" }).click();
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
  await page.reload();
  const savedRoutineLabels = await page.getByLabel("Routine label").evaluateAll(
    (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
  );
  expect(savedRoutineLabels).toContain(`Evening walk ${marker}`);
  expect(savedRoutineLabels).not.toContain(removedRoutineLabel);
  await expect(page.getByLabel("Display name")).toHaveCount(2);
  await expect(page.getByLabel("Display name").last()).toHaveValue(childName);
  await expect(page.getByLabel("Birthdate").last()).toHaveValue("2020-01-15");
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(3);
  await expect(page.getByLabel("Name", { exact: true }).last()).toHaveValue(caregiverName);
  await expect(page.getByRole("combobox", { name: "Relationship" }).last()).toContainText("Grandparent");

  const reviewerNames = [`Reviewer A ${marker}`, `Reviewer B ${marker}`];
  await expect(page.getByLabel("Reviewer name")).toHaveCount(0);
  await page.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await page.getByRole("button", { name: "Delete reviewer 1" }).click();
  await expect(page.getByLabel("Reviewer name")).toHaveCount(0);
  await page.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await page.getByLabel("Reviewer name").fill(reviewerNames[0]);
  await page.getByLabel("Email").fill(`reviewer-a-${marker}@example.com`);
  await page.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await page.getByLabel("Reviewer name").nth(1).fill(reviewerNames[1]);
  await page.getByLabel("Email").nth(1).fill(`reviewer-b-${marker}@example.com`);
  await expect(page.getByRole("button", { name: "Invite reviewer" })).toHaveCount(2);
  await page.getByRole("button", { name: "Invite reviewer" }).first().click();
  await expect(page.getByText("Reviewer invitation created.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Reviewer name")).toHaveCount(1);
  await expect(page.getByLabel("Reviewer name")).toHaveValue(reviewerNames[1]);
  await page.getByRole("button", { name: "Invite reviewer" }).click();
  await expect(page.getByLabel("Reviewer name")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(reviewerNames[0], { exact: true })).toBeVisible();
  await expect(page.getByText(reviewerNames[1], { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Revoke ${reviewerNames[0]}` }).click();
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

test("adds a record to a previous day and labels it as a late entry", async ({ page }) => {
  const marker = Date.now().toString();
  const label = `Historical caregiving ${marker}`;
  await page.goto("/");
  const dateInput = page.getByRole("textbox", { name: "Log date", exact: true });
  const today = await dateInput.inputValue();
  const [year, month, day] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);

  await dateInput.fill(previous);
  await expect(page).toHaveURL(new RegExp(`date=${previous}`));
  await expect(page.getByRole("textbox", { name: "Log date", exact: true })).toHaveValue(previous);
  await expect(page.getByText("Historical day", { exact: true })).toBeVisible();
  await expect(page.getByText(/labeled as late entries/i)).toBeVisible();

  await page.getByRole("button", { name: "Add record" }).click();
  await page.getByLabel("Activity").fill(label);
  await expect(page.getByLabel("When did it occur?")).toHaveValue(new RegExp(`^${previous}T`));
  await page.getByLabel("Factual notes (optional)").fill("Lunch was prepared and served at the kitchen table.");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("heading", { name: "Add caregiving record" })).not.toBeVisible();

  await page.goto("/timeline");
  await page.getByLabel("Search timeline").fill(label);
  const card = page.locator('[data-slot="card"]').filter({ hasText: label });
  await expect(card.getByText("Late entry", { exact: true })).toBeVisible();
  await expect(card.getByText(/Occurred/)).toBeVisible();
  await expect(card.getByText(/Entered/)).toBeVisible();

  await page.goto("/?date=9999-12-31");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("textbox", { name: "Log date", exact: true })).toHaveValue(today);
});
