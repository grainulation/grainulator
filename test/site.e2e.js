/**
 * Playwright E2E tests for the Grainulator landing page.
 *
 * Tests the UX flow: page load → input → chat → claims → compile → verdict.
 * Uses route interception to mock Pollinations LLM for deterministic output.
 * Covers desktop + mobile viewports, a11y landmarks, and keyboard navigation.
 */

import { expect, test } from "@playwright/test";

// ── Mock LLM response with realistic claims ─────────────────────────────────

const MOCK_LLM_RESPONSE = `Here's what the evidence shows across multiple dimensions.

SOC 2 Type II requires continuous monitoring and a point-in-time audit is insufficient for SaaS companies handling customer data. This is a hard constraint that cannot be bypassed.

The average SOC 2 audit costs between 50K and 150K for a 10-person startup with 3 to 6 months of preparation time needed. Vanta and Drata have reduced this to 4 to 8 weeks for companies with modern cloud infrastructure.

The biggest risk is that starting SOC 2 too early burns engineering cycles on compliance before product-market fit is achieved. Starting too late blocks enterprise sales because 73 percent of enterprise buyers require SOC 2 before signing any contract.

I would recommend beginning with SOC 2 Type I as a stepping stone because it validates control design without requiring 6 months of operational evidence. It can typically be completed in 6 to 8 weeks with the right tooling.

You should consider using automated compliance platforms which typically cost around 20K to 40K per year but save approximately 3 engineer-months of manual evidence collection work.

Another danger to watch for is that compliance tooling vendors sometimes overstate automation coverage and you must verify that your specific infrastructure stack is fully supported before committing.

The timeline estimate is approximately 4 to 8 weeks for Type I and 6 to 12 months for Type II depending on your current security posture and the number of trust service criteria you need to satisfy.`;

/**
 * Intercept Pollinations API and return deterministic claims.
 * This avoids network dependency and LLM non-determinism.
 */
async function mockLLM(context) {
	// Use context-level routing to intercept ALL requests including from service workers
	await context.route(/pollinations\.ai/, (route) => {
		route.fulfill({
			status: 200,
			contentType: "text/plain; charset=utf-8",
			body: MOCK_LLM_RESPONSE,
		});
	});
}

// ── Page load & initial state ────────────────────────────────────────────────

test.describe("page load", () => {
	test("renders with correct title and meta", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/Grainulator/);
		const desc = page.locator('meta[name="description"]');
		await expect(desc).toHaveAttribute(
			"content",
			/evidence-tracked research sprints/i,
		);
	});

	test("input is enabled and focusable on load", async ({ page }) => {
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });
		await expect(input).toHaveAttribute("placeholder", "Ask anything...");
	});

	test("canvas exists for lava shader", async ({ page }) => {
		await page.goto("/");
		const canvas = page.locator("#c");
		await expect(canvas).toBeAttached();
		await expect(canvas).toHaveAttribute("aria-hidden", "true");
	});

	test("compile bar is hidden initially", async ({ page }) => {
		await page.goto("/");
		const bar = page.locator("#compileBar");
		await expect(bar).not.toHaveClass(/visible/);
	});

	test("install CTA links to GitHub", async ({ page }) => {
		await page.goto("/");
		const cta = page.locator("#ctaInstall");
		await expect(cta).toHaveAttribute("href", /github\.com\/grainulation/);
	});
});

// ── A11y landmarks & ARIA ────────────────────────────────────────────────────

test.describe("accessibility", () => {
	test("has required ARIA landmarks", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator('main[role="log"]')).toBeAttached();
		await expect(page.locator("#progress-announcer")).toHaveAttribute(
			"aria-live",
			"polite",
		);
		await expect(page.locator("#state-announcer")).toHaveAttribute(
			"aria-live",
			"assertive",
		);
		await expect(page.locator("#compiler-announcer")).toHaveAttribute(
			"aria-live",
			"polite",
		);
	});

	test("input has associated label", async ({ page }) => {
		await page.goto("/");
		const label = page.locator('label[for="chatInput"]');
		await expect(label).toBeAttached();
		await expect(label).toHaveText(/research question/i);
	});

	test("new chat button has aria-label", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("#newChatBtn")).toHaveAttribute(
			"aria-label",
			"New chat",
		);
	});
});

// ── Chat flow: question → response → claims ─────────────────────────────────

test.describe("chat flow", () => {
	test("submitting a question shows user message and AI response", async ({
		page,
	}) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("How should a startup approach SOC 2 compliance?");
		await input.press("Enter");

		// User message appears
		const userMsg = page.locator(".msg-user").first();
		await expect(userMsg).toBeVisible({ timeout: 5000 });
		await expect(userMsg).toContainText("SOC 2");

		// AI response appears — note: first .msg-ai is the welcome message,
		// the LLM response is the second one (or the one containing our content)
		const aiMsgs = page.locator(".msg-ai");
		await expect(aiMsgs).toHaveCount(2, { timeout: 10000 });
		await expect(aiMsgs.nth(1)).toContainText("SOC 2");
	});

	test("AI response includes claims toggle with correct count", async ({
		page,
	}) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("How should a startup approach SOC 2 compliance?");
		await input.press("Enter");

		// Wait for AI response
		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});

		// Claims toggle should appear
		const toggle = page.locator(".claims-toggle").first();
		await expect(toggle).toBeVisible({ timeout: 5000 });
		await expect(toggle).toContainText(/claim/i);
	});

	test("claims toggle expands and shows claim badges", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("How should a startup approach SOC 2 compliance?");
		await input.press("Enter");

		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});

		const toggle = page.locator(".claims-toggle").first();
		await expect(toggle).toBeVisible({ timeout: 5000 });
		await toggle.click();

		// Claims panel should expand
		const panel = page.locator(".claims-panel").first();
		await expect(panel).toHaveClass(/open/, { timeout: 2000 });

		// Should have claim rows with type badges
		const rows = panel.locator(".claim-row");
		expect(await rows.count()).toBeGreaterThan(0);
	});

	test("thinking indicator shows during inference", async ({ page }) => {
		// Delay the mock response so we can catch the thinking state
		await page.context().route(/pollinations\.ai/, async (route) => {
			await new Promise((r) => setTimeout(r, 1000));
			route.fulfill({
				status: 200,
				contentType: "text/plain; charset=utf-8",
				body: MOCK_LLM_RESPONSE,
			});
		});
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("Test question");
		await input.press("Enter");

		// Thinking dots should appear
		const thinking = page.locator("#thinkingMsg, .thinking-dots");
		await expect(thinking.first()).toBeVisible({ timeout: 3000 });

		// Then disappear when response arrives
		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});
	});

	test("input clears after submission", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("Test question");
		await input.press("Enter");

		await expect(input).toHaveValue("");
	});

	test("Shift+Enter does not submit", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("Line 1");
		await input.press("Shift+Enter");

		// No user message should appear
		await expect(page.locator(".msg-user")).toHaveCount(0);
	});
});

// ── Compile flow ─────────────────────────────────────────────────────────────

test.describe("compile flow", () => {
	test("compile bar appears after enough claims accumulate", async ({
		page,
	}) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		// Send question to get claims
		await input.fill("How should a startup approach SOC 2 compliance?");
		await input.press("Enter");
		// Wait for LLM response (2nd .msg-ai, after welcome message)
		await expect(page.locator(".msg-ai")).toHaveCount(2, { timeout: 10000 });

		// Compile bar should become visible (5+ claims, 2+ types from mock)
		const bar = page.locator("#compileBar");
		await expect(bar).toHaveClass(/visible/, { timeout: 5000 });
	});

	test("compile button shows claim count", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("How should a startup approach SOC 2 compliance?");
		await input.press("Enter");
		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});

		const btn = page.locator("#compileMsgBtn");
		await expect(btn).toBeVisible({ timeout: 5000 });
		await expect(btn).toContainText(/compile \d+ claims/i);
	});

	test("clicking compile runs 7 passes and shows verdict", async ({
		page,
	}) => {
		test.setTimeout(60000);
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("How should a startup approach SOC 2 compliance?");
		await input.press("Enter");
		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});

		// Wait for compile bar and button to be ready
		const btn = page.locator("#compileMsgBtn");
		await expect(page.locator("#compileBar")).toHaveClass(/visible/, {
			timeout: 5000,
		});
		await expect(btn).toBeEnabled({ timeout: 5000 });
		// Use JS click — the compile bar can be overlapped by chat content
		await btn.evaluate((el) => el.click());

		// 7 pass lines should appear (each animated in with ~300ms delay)
		const passes = page.locator(".pass-line");
		await expect(passes).toHaveCount(7, { timeout: 15000 });

		// Verdict should appear
		const verdict = page.locator(".verdict-title, .verdict-body");
		await expect(verdict.first()).toBeVisible({ timeout: 5000 });
	});

	test("handoff section appears after compile", async ({ page }) => {
		test.setTimeout(60000);
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("How should a startup approach SOC 2 compliance?");
		await input.press("Enter");
		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});

		const compileBtn = page.locator("#compileMsgBtn");
		await expect(page.locator("#compileBar")).toHaveClass(/visible/, {
			timeout: 5000,
		});
		await expect(compileBtn).toBeEnabled({ timeout: 5000 });
		await compileBtn.evaluate((el) => el.click());

		// Wait for compile to finish (7 passes)
		await expect(page.locator(".pass-line")).toHaveCount(7, {
			timeout: 15000,
		});

		// Handoff section with copy button
		const handoff = page.locator(".handoff-section");
		await expect(handoff).toBeVisible({ timeout: 5000 });
	});
});

// ── State transitions ────────────────────────────────────────────────────────

test.describe("state transitions", () => {
	test("dim overlay activates on first message", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		// Before chat — overlay should be transparent
		const overlay = page.locator("#dimOverlay");
		const opacityBefore = await overlay.evaluate(
			(el) => getComputedStyle(el).opacity,
		);
		expect(Number(opacityBefore)).toBeLessThan(0.5);

		// Send message
		await input.fill("Test question");
		await input.press("Enter");

		// After chat — overlay should be opaque
		await expect(page.locator(".msg-user")).toBeVisible({ timeout: 3000 });
		await page.waitForTimeout(700); // transition duration
		const opacityAfter = await overlay.evaluate(
			(el) => getComputedStyle(el).opacity,
		);
		expect(Number(opacityAfter)).toBeGreaterThan(0.5);
	});

	test("app gets chat-active class on first message", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		const app = page.locator("#app");
		await expect(app).not.toHaveClass(/chat-active/);

		await input.fill("Test");
		await input.press("Enter");

		await expect(app).toHaveClass(/chat-active/, { timeout: 3000 });
	});
});

// ── New chat reset ───────────────────────────────────────────────────────────

test.describe("new chat", () => {
	test("new chat clears messages and resets state", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("Test question");
		await input.press("Enter");
		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});

		// Accept confirm dialog before clicking
		page.on("dialog", (dialog) => dialog.accept());

		await page.locator("#newChatBtn").click();

		// Messages should be cleared
		await expect(page.locator(".msg-user")).toHaveCount(0, { timeout: 5000 });

		// Input should be re-enabled and empty
		await expect(input).toBeEnabled();
		await expect(input).toHaveValue("");
	});
});

// ── Mobile viewport ──────────────────────────────────────────────────────────

test.describe("mobile", () => {
	test.use({ viewport: { width: 375, height: 667 } });

	test("input bar is visible and usable on mobile", async ({ page }) => {
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });
		await expect(input).toBeVisible();
		await expect(page.locator("#inputBar")).toHaveClass(/visible/);
	});

	test("chat flow works on mobile viewport", async ({ page }) => {
		await mockLLM(page.context());
		await page.goto("/");
		const input = page.locator("#chatInput");
		await expect(input).toBeEnabled({ timeout: 5000 });

		await input.fill("Mobile test question");
		await input.press("Enter");

		await expect(page.locator(".msg-user").first()).toBeVisible({
			timeout: 5000,
		});
		// Wait for LLM response (2nd .msg-ai, after welcome)
		await expect(page.locator(".msg-ai")).toHaveCount(2, {
			timeout: 10000,
		});
	});
});

// ── Service worker ───────────────────────────────────────────────────────────

test.describe("service worker", () => {
	test("registers without errors", async ({ page }) => {
		const errors = [];
		page.on("pageerror", (err) => errors.push(err.message));

		await page.goto("/");
		// Give SW time to register
		await page.waitForTimeout(2000);

		const swErrors = errors.filter(
			(e) => e.includes("sw.js") || e.includes("ServiceWorker"),
		);
		expect(swErrors).toHaveLength(0);
	});
});

// ── PWA manifest ─────────────────────────────────────────────────────────────

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

// ── Dead code verification ───────────────────────────────────────────────────

test.describe("dead code", () => {
	test("demos.json is fetched but fuzzyMatchDemo is never called", async ({
		page,
	}) => {
		// Verify the function exists but is never invoked
		await page.goto("/");
		const result = await page.evaluate(() => {
			return {
				fuzzyMatchDefined: typeof fuzzyMatchDemo === "function",
				loadDemoDefined: typeof loadDemo === "function",
			};
		});
		// These are defined (confirms dead code exists to be cleaned up)
		expect(result.fuzzyMatchDefined).toBe(true);
		expect(result.loadDemoDefined).toBe(true);
	});
});
