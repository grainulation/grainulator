/**
 * Playwright E2E tests for the Grainulator sprint-mode page.
 *
 * Tests the UX flow: page load → input → 3-pass sprint → compiler → answer.
 * Uses route interception to mock Pollinations LLM for deterministic output.
 * Covers desktop + mobile viewports, a11y, PWA, offline mode, and dead code.
 */

import { expect, test } from "@playwright/test";

// ── Sprint-mode page path ───────────────────────────────────────────────────

const SPRINT_PATH = "/sprint.html";

// ── Mock LLM setup ──────────────────────────────────────────────────────────

/**
 * Intercept Pollinations API at context level and return deterministic claims.
 * Production mode uses POST with JSON response.
 */
async function mockLLM(context) {
  await context.route(/pollinations\.ai/, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content:
                "[FACTUAL] Test fact about the topic that exceeds twenty characters easily.\n[RISK] This could go wrong in several important ways for users.\n[CONSTRAINT] Must consider this limit when planning the approach.\n[RECOMMENDATION] Do this instead because it is the better path forward.\n[ESTIMATE] Takes 2-4 weeks depending on scope and team velocity.",
            },
          },
        ],
      }),
    });
  });
}

/** Helper: submit a question and wait for sprint state to become active. */
async function submitQuestion(
  page,
  question = "How does SOC 2 compliance work?",
) {
  const input = page.locator("#questionInput");
  await expect(input).toBeEnabled({ timeout: 5000 });
  await input.fill(question);
  await page.locator("#submitBtn").click();
  await expect(page.locator("#sprintState")).toHaveClass(/active/, {
    timeout: 5000,
  });
}

/** Helper: wait for answer state to become active (sprint completed). */
async function waitForAnswer(page) {
  await expect(page.locator("#answerState")).toHaveClass(/active/, {
    timeout: 45000,
  });
}

// ── Page load & initial state ───────────────────────────────────────────────

test.describe("page load", () => {
  test("renders with correct title", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    await expect(page).toHaveTitle(/Grainulator/);
  });

  test("input state is active on load", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    await expect(page.locator("#inputState")).toHaveClass(/active/);
    await expect(page.locator("#sprintState")).not.toHaveClass(/active/);
    await expect(page.locator("#answerState")).not.toHaveClass(/active/);
  });

  test("lava background exists", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    const lava = page.locator("#lavaBg");
    await expect(lava).toBeAttached();
  });
});

// ── Input state ─────────────────────────────────────────────────────────────

test.describe("input state", () => {
  test("input field is enabled and focusable on load", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    const input = page.locator("#questionInput");
    await expect(input).toBeEnabled({ timeout: 5000 });
    await expect(input).toHaveAttribute("placeholder", /complex question/i);
  });

  test("submit button exists", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    const btn = page.locator("#submitBtn");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/run sprint/i);
  });

  test("compile bar is NOT visible initially", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    const compiler = page.locator("#compilerLines");
    const display = await compiler.evaluate(
      (el) => getComputedStyle(el).display,
    );
    expect(display).toBe("none");
  });
});

// ── Accessibility ───────────────────────────────────────────────────────────

test.describe("accessibility", () => {
  test("has ARIA live region for announcements", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    await expect(page.locator("#announcer")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  test("phase tint overlay exists for color feedback", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    await expect(page.locator("#phaseTint.phase-tint")).toBeAttached();
  });
});

// ── Sprint flow ─────────────────────────────────────────────────────────────

test.describe("sprint flow", () => {
  test.setTimeout(45000);

  test("submitting question transitions to sprint state", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    await expect(page.locator("#inputState")).not.toHaveClass(/active/);
    await expect(page.locator("#sprintState")).toHaveClass(/active/);
  });

  test("phase label shows during sprint", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    const label = page.locator(".sprint-phase-label");
    await expect(label).toBeVisible({ timeout: 5000 });
    await expect(label).toContainText(
      /researching|challenging|synthesizing|compiling|initializing/i,
    );
  });

  test("claim pills appear during sprint", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    const pills = page.locator(".claim-pill");
    await expect(pills.first()).toBeAttached({ timeout: 15000 });
  });

  test("sprint completes and shows answer state", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    await waitForAnswer(page);
    await expect(page.locator("#answerState")).toHaveClass(/active/);
  });

  test("answer has claim bar with stats", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    await waitForAnswer(page);
    const stats = page.locator(".stat-value");
    expect(await stats.count()).toBeGreaterThanOrEqual(3);
  });

  test("answer has claims grouped by type", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    await waitForAnswer(page);
    const headers = page.locator(".claims-group-header");
    await expect(headers.first()).toBeVisible({ timeout: 5000 });
    const cards = page.locator(".claim-card");
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("answer has verdict with confidence score", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    await waitForAnswer(page);
    const verdict = page.locator(".verdict-label");
    await expect(verdict).toBeVisible({ timeout: 5000 });
    await expect(verdict).toContainText(/confidence/i);
    await expect(verdict).toContainText(/\d+\/100/);
  });

  test("CTA button exists with correct question", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page, "How does SOC 2 work?");
    await waitForAnswer(page);
    const ctaCode = page.locator("#ctaCode");
    await expect(ctaCode).toBeVisible({ timeout: 5000 });
    await expect(ctaCode).toContainText(/wheat init/);
    await expect(ctaCode).toContainText(/SOC 2/);
    await expect(page.locator("#ctaBtn")).toBeVisible();
  });

  test("ask a different question resets to input state", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    await waitForAnswer(page);
    const restart = page.locator("#restartBtn");
    await expect(restart).toBeVisible({ timeout: 5000 });
    await restart.click();
    await expect(page.locator("#inputState")).toHaveClass(/active/, {
      timeout: 5000,
    });
    await expect(page.locator("#answerState")).not.toHaveClass(/active/);
    const input = page.locator("#questionInput");
    await expect(input).toHaveValue("");
  });
});

// ── Compile flow ────────────────────────────────────────────────────────────

test.describe("compile flow", () => {
  test.setTimeout(45000);

  test("compiler pass lines appear (7 total)", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    // Compiler runs during sprint, before answer renders
    const passes = page.locator(".pass-line");
    await expect(passes).toHaveCount(7, { timeout: 40000 });
  });

  test("verdict shows confidence score", async ({ page }) => {
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page);
    await waitForAnswer(page);
    const verdict = page.locator(".verdict-label");
    await expect(verdict).toContainText(/\d+\/100/, { timeout: 5000 });
  });
});

// ── Mobile viewport ─────────────────────────────────────────────────────────

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("input bar visible at 375px", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    const input = page.locator("#questionInput");
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled({ timeout: 5000 });
    await expect(page.locator("#submitBtn")).toBeVisible();
  });

  test("sprint flow works on mobile", async ({ page }) => {
    test.setTimeout(45000);
    await mockLLM(page.context());
    await page.goto(SPRINT_PATH);
    await submitQuestion(page, "Mobile test question");
    await waitForAnswer(page);
    await expect(page.locator("#answerState")).toHaveClass(/active/);
    const stats = page.locator(".stat-value");
    expect(await stats.count()).toBeGreaterThanOrEqual(3);
  });
});

// ── Offline mode ────────────────────────────────────────────────────────────

test.describe("offline mode", () => {
  test.setTimeout(45000);

  test("?offline auto-starts sprint", async ({ page }) => {
    await page.goto(SPRINT_PATH + "?offline");
    // Sprint state should become active automatically
    await expect(page.locator("#sprintState")).toHaveClass(/active/, {
      timeout: 5000,
    });
  });

  test("shows TRACK_A claims", async ({ page }) => {
    await page.goto(SPRINT_PATH + "?offline");
    // Wait for answer state — offline mode uses TRACK_A claims and runs fast
    await waitForAnswer(page);
    const cards = page.locator(".claim-card");
    expect(await cards.count()).toBeGreaterThanOrEqual(10);
    // Verify TRACK_A claim content is present
    const firstCard = page.locator(".claim-card-text").first();
    await expect(firstCard).toContainText(/WCAG|accessibility|screen reader/i);
  });
});

// ── PWA manifest ────────────────────────────────────────────────────────────

test.describe("PWA", () => {
  test("manifest is valid and linked", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveAttribute("href", /manifest\.json/);

    const res = await page.request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name).toBe("Grainulator");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
  });
});

// ── Service worker ──────────────────────────────────────────────────────────

test.describe("service worker", () => {
  test("registers without errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForTimeout(2000);

    const swErrors = errors.filter(
      (e) => e.includes("sw.js") || e.includes("ServiceWorker"),
    );
    expect(swErrors).toHaveLength(0);
  });
});

// ── Dead code verification ──────────────────────────────────────────────────

test.describe("dead code removed", () => {
  test("fuzzyMatchDemo does NOT exist", async ({ page }) => {
    await page.goto(SPRINT_PATH);
    const result = await page.evaluate(() => {
      return {
        fuzzyMatchDefined: typeof window.fuzzyMatchDemo === "function",
        loadDemoDefined: typeof window.loadDemo === "function",
        scoreEntryDefined: typeof window.scoreEntry === "function",
        demoLibraryDefined: typeof window.DEMO_LIBRARY !== "undefined",
      };
    });
    expect(result.fuzzyMatchDefined).toBe(false);
    expect(result.loadDemoDefined).toBe(false);
    expect(result.scoreEntryDefined).toBe(false);
    expect(result.demoLibraryDefined).toBe(false);
  });

  test("demos.json not in sw.js cache", async ({ page }) => {
    const res = await page.request.get("/sw.js");
    expect(res.ok()).toBeTruthy();
    const swContent = await res.text();
    expect(swContent).not.toContain("demos.json");
  });
});
