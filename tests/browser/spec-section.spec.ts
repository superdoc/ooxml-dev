import { expect, test, type Page, type Route } from "@playwright/test";

const pdfOrigin = "https://cdn.ooxml.dev";
const part1 = `${pdfOrigin}/ecma-376/part1.pdf`;

// The actual app/React router runs locally. Only the section service and PDF body
// are fixtures: no live API, search/model request, telemetry or PDF download.
const result = (partNumber = 1, pageNumber: number | null = 239, sectionId = "17.3.1.24") => ({
	results: [{ id: 1, partNumber, sectionId, title: "pBdr", content: "Paragraph borders", pageNumber, score: 1 }],
});

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

async function isolate(page: Page, section: (route: Route) => Promise<void>) {
	const pdfRequests: string[] = [];
	await page.addInitScript(() => {
		const state = window as Window & { createdPdfFrames: string[] };
		state.createdPdfFrames = [];
		new MutationObserver(records => {
			for (const record of records) for (const node of record.addedNodes) {
				if (!(node instanceof Element)) continue;
				const frames = node instanceof HTMLIFrameElement ? [node] : [...node.querySelectorAll("iframe")];
				for (const frame of frames) state.createdPdfFrames.push(frame.src);
			}
		}).observe(document, { childList: true, subtree: true });
	});
	await page.context().route("**/*", async route => {
		const url = new URL(route.request().url());
		if (url.origin === pdfOrigin) {
			pdfRequests.push(route.request().url());
			await route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Public PDF navigation fixture</p>" });
		} else if (["/__test_api/section", "/__test_api/search"].includes(url.pathname)) {
			await section(route);
		} else if (url.origin === "http://127.0.0.1:19138" && ["GET", "HEAD"].includes(route.request().method())) {
			await route.continue();
		} else {
			await route.abort();
		}
	});
	return pdfRequests;
}

async function lookup(page: Page, query = "section=17.3.1.24&part=1") {
	await page.goto(`/spec?${query}`);
	await expect(page.getByText("Searching...", { exact: true })).toBeVisible();
}

test("explicit section waits for mapping, then opens printed239 as PDF249 without a default iframe", async ({ page }) => {
	const pending = deferred();
	const pdfs = await isolate(page, async route => {
		await pending.promise;
		await route.fulfill({ json: result() });
	});
	try {
		await lookup(page);
		await expect(page.locator("iframe")).toHaveCount(0, { timeout: 1500 });
		expect(pdfs).toEqual([]);
		await expect(page.getByRole("link", { name: "Open official PDF" })).toHaveAttribute("href", part1);
		await page.screenshot({ path: test.info().outputPath("pending.png") });
		pending.resolve();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=249&toolbar=0&navpanes=0`);
		await expect(page.getByRole("link", { name: "Open PDF in new tab" })).toHaveAttribute("href", `${part1}#page=249`);
		expect(pdfs).toEqual([part1]);
		expect(await page.evaluate(() => (window as Window & { createdPdfFrames: string[] }).createdPdfFrames)).toEqual([`${part1}#page=249&toolbar=0&navpanes=0`]);
		await page.screenshot({ path: test.info().outputPath("resolved.png") });
	} finally { pending.resolve(); }
});

test("a part2 deep link never mounts or preloads default part1", async ({ page }) => {
	const pending = deferred();
	const pdfs = await isolate(page, async route => {
		await pending.promise;
		await route.fulfill({ json: result(2, 77, "9.1") });
	});
	try {
		await lookup(page, "section=9.1&part=2");
		await expect(page.locator("iframe")).toHaveCount(0, { timeout: 1500 });
		await expect(page.locator('link[rel="preload"][href$="part1.pdf"]')).toHaveCount(0);
		await expect(page.getByRole("link", { name: "Open official PDF" })).toHaveAttribute("href", `${pdfOrigin}/ecma-376/part2.pdf`);
		pending.resolve();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${pdfOrigin}/ecma-376/part2.pdf#page=85&toolbar=0&navpanes=0`);
		expect(pdfs).toEqual([`${pdfOrigin}/ecma-376/part2.pdf`]);
	} finally { pending.resolve(); }
});

for (const failure of ["http", "missing", "invalid-page", "page-range", "fractional-page", "invalid-part", "invalid-title", "malformed"] as const) {
	test(`${failure} lookup keeps the PDF unmounted and can retry successfully`, async ({ page }) => {
		let attempts = 0;
		const pdfs = await isolate(page, async route => {
			attempts++;
			if (attempts > 1) return route.fulfill({ json: result() });
			if (failure === "http") return route.fulfill({ status: 503, json: { error: "unavailable" } });
			if (failure === "missing") return route.fulfill({ json: { results: [] } });
			if (failure === "invalid-page") return route.fulfill({ json: result(1, null) });
			if (failure === "page-range") return route.fulfill({ json: result(1, 5017) });
			if (failure === "fractional-page") return route.fulfill({ json: result(1, 239.5) });
			if (failure === "invalid-part") return route.fulfill({ json: result(9) });
			if (failure === "invalid-title") return route.fulfill({ json: { results: [{ ...result().results[0], title: {} }] } });
			return route.fulfill({ json: { results: "invalid" } });
		});
		await page.goto("/spec?section=17.3.1.24&part=1");
		await expect(page.getByRole("alert")).toBeVisible();
		if (failure === "http") await page.screenshot({ path: test.info().outputPath("lookup-error.png") });
		await expect(page.locator("iframe")).toHaveCount(0);
		expect(pdfs).toEqual([]);
		await expect(page.getByRole("link", { name: "Open official PDF" })).toHaveAttribute("href", part1);
		await page.getByRole("button", { name: "Retry section lookup" }).click();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=249&toolbar=0&navpanes=0`);
		await expect(page.getByRole("alert")).toHaveCount(0);
		expect(attempts).toBe(2);
	});
}

test("normal no-section browsing immediately opens page1 and keeps page controls", async ({ page }) => {
	let lookups = 0;
	await isolate(page, async route => { lookups++; await route.abort(); });
	await page.goto("/spec");
	await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=11&toolbar=0&navpanes=0`);
	await page.getByRole("button", { name: "Next page" }).click();
	await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=12&toolbar=0&navpanes=0`);
	await expect(page.getByRole("button", { name: "Previous page" })).toBeEnabled();
	await expect(page.getByRole("alert")).toHaveCount(0);
	expect(lookups).toBe(0);
});

test("a parent section keeps the service's mapped descendant results browsable", async ({ page }) => {
	await isolate(page, async route => {
		await route.fulfill({ json: { results: [
			result(1, 20, "17.3.1").results[0],
			{ ...result(1, 21, "17.3.2").results[0], id: 2 },
		] } });
	});
	await page.goto("/spec?section=17.3&part=1");
	await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=30&toolbar=0&navpanes=0`);
	await page.getByRole("button", { name: /17\.3\.2/ }).click();
	await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=31&toolbar=0&navpanes=0`);
});

test("a stalled lookup times out without a PDF and offers a working retry", async ({ page }) => {
	const stalled = deferred();
	let attempts = 0;
	await page.clock.install();
	await isolate(page, async route => {
		if (++attempts === 1) {
			await stalled.promise;
			await route.fulfill({ json: result() }).catch(() => {}); // Timed-out request is aborted.
		} else {
			await route.fulfill({ json: result() });
		}
	});
	try {
		await lookup(page);
		await expect.poll(() => attempts).toBe(1);
		await page.clock.fastForward(15_001);
		await expect(page.getByRole("alert")).toBeVisible();
		await expect(page.locator("iframe")).toHaveCount(0);
		await page.getByRole("button", { name: "Retry section lookup" }).click();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=249&toolbar=0&navpanes=0`);
	} finally { stalled.resolve(); }
});

test("a user search can recover a failed explicit section lookup", async ({ page }) => {
	await isolate(page, async route => {
		if (new URL(route.request().url()).pathname.endsWith("/section")) {
			await route.fulfill({ status: 503, json: { error: "unavailable" } });
		} else {
			await route.fulfill({ json: result(2, 77, "9.1") });
		}
	});
	await page.goto("/spec?section=17.3.1.24&part=1");
	await expect(page.getByRole("alert")).toBeVisible();
	await page.locator("textarea").fill("package relationships");
	await page.locator("textarea").press("Enter");
	await expect(page.locator("iframe")).toHaveAttribute("src", `${pdfOrigin}/ecma-376/part2.pdf#page=85&toolbar=0&navpanes=0`);
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an ordinary query keeps default browsing while search is pending", async ({ page }) => {
	const pending = deferred();
	await isolate(page, async route => {
		await pending.promise;
		await route.fulfill({ json: result() });
	});
	try {
		await page.goto("/spec?q=paragraph%20borders");
		await expect(page.getByText("Searching...", { exact: true })).toBeVisible();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=11&toolbar=0&navpanes=0`);
		pending.resolve();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=249&toolbar=0&navpanes=0`);
	} finally { pending.resolve(); }
});

test("a newer section URL wins over a late previous lookup", async ({ page }) => {
	const old = deferred();
	await isolate(page, async route => {
		if (new URL(route.request().url()).searchParams.get("id") === "17.3.1.24") {
			await old.promise;
			await route.fulfill({ json: result() }).catch(() => {}); // Aborted by navigation after the fix.
		} else {
			await route.fulfill({ json: result(2, 77, "9.1") });
		}
	});
	try {
		await lookup(page);
		await page.evaluate(() => {
			history.pushState({}, "", "/spec?section=9.1&part=2");
			dispatchEvent(new PopStateEvent("popstate"));
		});
		await expect(page.locator("iframe")).toHaveAttribute("src", `${pdfOrigin}/ecma-376/part2.pdf#page=85&toolbar=0&navpanes=0`, { timeout: 2000 });
		old.resolve();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${pdfOrigin}/ecma-376/part2.pdf#page=85&toolbar=0&navpanes=0`);
	} finally { old.resolve(); }
});

test("an unknown part offers all official PDFs rather than guessing Part1", async ({ page }) => {
	const pending = deferred();
	await isolate(page, async route => {
		await pending.promise;
		await route.fulfill({ json: result(3, 12, "10.1") });
	});
	try {
		await lookup(page, "section=10.1");
		await expect(page.getByRole("link", { name: /^Open Part [1-4] PDF$/ })).toHaveCount(4);
		await expect(page.getByRole("link", { name: "Open official PDF", exact: true })).toHaveCount(0);
		for (let part = 1; part <= 4; part++) {
			await expect(page.getByRole("link", { name: `Open Part ${part} PDF`, exact: true })).toHaveAttribute("href", `${pdfOrigin}/ecma-376/part${part}.pdf`);
		}
		await page.screenshot({ path: test.info().outputPath("unknown-part.png") });
		pending.resolve();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${pdfOrigin}/ecma-376/part3.pdf#page=18&toolbar=0&navpanes=0`);
	} finally { pending.resolve(); }
});

test("a section retry wins over an older text search", async ({ page }) => {
	const oldSearch = deferred();
	const newSection = deferred();
	const oldDone = deferred();
	let sectionAttempts = 0;
	const isOldSearch = (request: import("@playwright/test").Request) => request.url().endsWith("/__test_api/search") && request.postDataJSON()?.query === "older search";
	page.on("requestfinished", request => { if (isOldSearch(request)) oldDone.resolve(); });
	page.on("requestfailed", request => { if (isOldSearch(request)) oldDone.resolve(); });
	await isolate(page, async route => {
		if (new URL(route.request().url()).pathname.endsWith("/section")) {
			if (++sectionAttempts === 1) return route.fulfill({ status: 503, json: {} });
			await newSection.promise;
			return route.fulfill({ json: result() });
		}
		if (isOldSearch(route.request())) {
			await oldSearch.promise;
			return route.fulfill({ json: result(2, 77, "9.1") }).catch(() => {});
		}
		await route.fulfill({ status: 503, json: {} });
	});
	try {
		await page.goto("/spec?section=17.3.1.24&part=1");
		await expect(page.getByRole("alert")).toBeVisible();
		await page.locator("textarea").fill("older search");
		await page.locator("textarea").press("Enter");
		await page.locator("textarea").fill("newer search");
		await page.locator("textarea").press("Enter");
		await expect(page.getByRole("button", { name: "Retry section lookup" })).toBeEnabled();
		await page.getByRole("button", { name: "Retry section lookup" }).click();
		await expect.poll(() => sectionAttempts).toBe(2);
		oldSearch.resolve();
		await oldDone.promise;
		await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
		await expect(page.locator("iframe")).toHaveCount(0, { timeout: 1500 });
		newSection.resolve();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=249&toolbar=0&navpanes=0`);
	} finally { oldSearch.resolve(); newSection.resolve(); }
});

for (const initialSection of [true, false]) {
	test(`a failed text search retains its query and retries search (section=${initialSection})`, async ({ page }) => {
		let sectionAttempts = 0;
		const queries: string[] = [];
		await isolate(page, async route => {
			if (new URL(route.request().url()).pathname.endsWith("/section")) {
				sectionAttempts++;
				return route.fulfill({ status: 503, json: {} });
			}
			queries.push(route.request().postDataJSON().query);
			if (queries.length === 1) return route.fulfill({ status: 503, json: {} });
			return route.fulfill({ json: result(2, 77, "9.1") });
		});
		await page.goto(initialSection ? "/spec?section=17.3.1.24&part=1" : "/spec");
		if (initialSection) await expect(page.getByRole("alert")).toBeVisible();
		await page.locator("textarea").fill("package relationships");
		await page.locator("textarea").press("Enter");
		await expect(page.getByRole("alert").filter({ hasText: "Search unavailable" })).toBeVisible();
		await expect(page.locator("textarea")).toHaveValue("package relationships");
		await page.screenshot({ path: test.info().outputPath(`search-error-section-${initialSection}.png`) });
		if (!initialSection) await expect(page.locator("iframe")).toHaveAttribute("src", `${part1}#page=11&toolbar=0&navpanes=0`);
		await page.getByRole("button", { name: "Retry search", exact: true }).click();
		await expect(page.locator("iframe")).toHaveAttribute("src", `${pdfOrigin}/ecma-376/part2.pdf#page=85&toolbar=0&navpanes=0`);
		expect(queries).toEqual(["package relationships", "package relationships"]);
		expect(sectionAttempts).toBe(initialSection ? 1 : 0);
	});
}

for (const initialSection of [true, false]) {
	test(`a stalled text search times out and offers a working retry (section=${initialSection})`, async ({ page }) => {
		const stalled = deferred();
		const queries: string[] = [];
		await page.clock.install();
		await isolate(page, async route => {
			if (new URL(route.request().url()).pathname.endsWith("/section")) return route.fulfill({ status: 503, json: {} });
			queries.push(route.request().postDataJSON().query);
			if (queries.length === 1) {
				await stalled.promise;
				return route.fulfill({ json: result(2, 77, "9.1") }).catch(() => {}); // Timed-out request is aborted.
			}
			return route.fulfill({ json: result(2, 77, "9.1") });
		});
		try {
			await page.goto(initialSection ? "/spec?section=17.3.1.24&part=1" : "/spec");
			if (initialSection) await expect(page.getByRole("alert")).toBeVisible();
			await page.locator("textarea").fill("package relationships");
			await page.locator("textarea").press("Enter");
			await expect.poll(() => queries.length).toBe(1);
			await page.clock.fastForward(15_001);
			await expect(page.getByRole("alert").filter({ hasText: "Search unavailable" })).toBeVisible();
			await expect(page.locator("textarea")).toHaveValue("package relationships");
			await page.getByRole("button", { name: "Retry search", exact: true }).click();
			await expect(page.locator("iframe")).toHaveAttribute("src", `${pdfOrigin}/ecma-376/part2.pdf#page=85&toolbar=0&navpanes=0`);
			expect(queries).toEqual(["package relationships", "package relationships"]);
		} finally { stalled.resolve(); }
	});
}
