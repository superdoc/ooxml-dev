import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { PdfViewer } from "../components/PdfViewer";
import { PDF_CONFIG } from "../components/pdfNavigation";
import { getSeoMeta } from "../data/seo";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// MCP server response type
interface MCPSearchResult {
	id: number;
	partNumber: number;
	sectionId: string | null;
	title: string | null;
	content: string;
	contentType: string;
	pageNumber: number | null;
	score: number;
}

interface MCPSearchResponse {
	query: string;
	results: MCPSearchResult[];
}

// Search result type
interface SpecSearchResult {
	id: string;
	sectionId: string;
	title: string;
	description?: string;
	partNumber: number;
	pageNumber: number | null;
}

// Default PDF URL for preloading
const DEFAULT_PDF_URL = "https://cdn.ooxml.dev/ecma-376/part1.pdf";

export function SpecExplorer() {
	const [searchParams] = useSearchParams();
	const initialQuery = searchParams.get("q") || "";
	const initialSection = searchParams.get("section") || "";
	const initialPart = searchParams.get("part") || "";
	return (
		<SpecExplorerView
			key={JSON.stringify([initialQuery, initialSection, initialPart])}
			initialQuery={initialQuery}
			initialSection={initialSection}
			initialPart={initialPart}
		/>
	);
}

function SpecExplorerView({
	initialQuery,
	initialSection,
	initialPart,
}: {
	initialQuery: string;
	initialSection: string;
	initialPart: string;
}) {
	useDocumentTitle(getSeoMeta("/spec").title);
	const [search, setSearch] = useState(initialQuery);
	const [submittedSearch, setSubmittedSearch] = useState("");
	const [results, setResults] = useState<SpecSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedResult, setSelectedResult] = useState<SpecSearchResult | null>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const hasAutoSearched = useRef(false);
	// Set this before the first render, not in an effect that already mounted page1.
	const [viewerStatus, setViewerStatus] = useState<
		"pending" | "ready" | "missing" | "error" | "searching" | "search-error" | "search-missing"
	>(initialSection ? "pending" : "ready");
	const [searchFailed, setSearchFailed] = useState(false);
	const activeRequest = useRef<AbortController | null>(null);
	const activeRequestId = useRef(0);
	const officialPdf = PDF_CONFIG[Number(initialPart)]?.url;
	const cancelActiveRequest = useCallback(() => {
		activeRequestId.current++;
		activeRequest.current?.abort();
	}, []);

	// Preload the default PDF
	useEffect(() => {
		// An explicit section may resolve to another part. Its viewer loads the
		// mapped official PDF directly, without preloading an unrelated Part1.
		if (initialSection) return;
		const link = document.createElement("link");
		link.rel = "preload";
		link.as = "document";
		link.href = DEFAULT_PDF_URL;
		document.head.appendChild(link);
		return () => {
			document.head.removeChild(link);
		};
	}, [initialSection]);

	// Submit search
	const handleSubmit = useCallback(
		async (retry = false) => {
			const query = search.trim();
			if (!query || (query === submittedSearch && !retry && !searchFailed)) return;

			cancelActiveRequest();
			const requestId = activeRequestId.current;
			const controller = new AbortController();
			activeRequest.current = controller;
			setSubmittedSearch(query);
			setIsLoading(true);
			setSearchFailed(false);
			setViewerStatus((status) => (status === "ready" ? status : "searching"));

			try {
				const res = await fetch(`${import.meta.env.VITE_API_URL}/search`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query, limit: 10 }),
					signal: controller.signal,
				});
				if (!res.ok) throw new Error("Search unavailable");
				const data: MCPSearchResponse = await res.json();
				if (requestId !== activeRequestId.current) return;

				const transformed: SpecSearchResult[] = data.results.map((r) => ({
					id: `spec-${r.id}`,
					sectionId: r.sectionId || "",
					title: r.title || r.content.slice(0, 60),
					description: r.title ? r.content.slice(0, 120) : undefined,
					partNumber: r.partNumber,
					pageNumber: r.pageNumber,
				}));

				setResults(transformed);
				setSelectedIndex(0);
				if (transformed.length > 0) {
					setSelectedResult(transformed[0]);
					setViewerStatus("ready");
				} else {
					setViewerStatus((status) => (status === "ready" ? status : "search-missing"));
				}
			} catch (err) {
				if (requestId !== activeRequestId.current) return;
				console.error("Search failed:", err);
				setResults([]);
				setSearchFailed(true);
				setViewerStatus((status) => (status === "ready" ? status : "search-error"));
			} finally {
				if (requestId === activeRequestId.current) setIsLoading(false);
			}
		},
		[search, submittedSearch, searchFailed, cancelActiveRequest],
	);

	// Fetch a specific section by ID (e.g., ?section=17.3.1.24&part=1)
	const handleSectionLookup = useCallback(async () => {
		if (!initialSection) return;
		cancelActiveRequest();
		const requestId = activeRequestId.current;
		const controller = new AbortController();
		activeRequest.current = controller;
		const timeout = window.setTimeout(() => controller.abort(), 15_000);
		setIsLoading(true);
		setSearchFailed(false);
		setViewerStatus("pending");
		setSearch(initialSection);
		try {
			const params = new URLSearchParams({ id: initialSection });
			if (initialPart) params.set("part", initialPart);
			const res = await fetch(`${import.meta.env.VITE_API_URL}/section?${params}`, {
				signal: controller.signal,
			});
			if (!res.ok) throw new Error("Section lookup unavailable");
			const data = (await res.json()) as { results: MCPSearchResult[] };
			if (!Array.isArray(data?.results)) throw new Error("Invalid section response");
			if (requestId !== activeRequestId.current) return;

			const mapped = data.results.filter((r) => {
				if (!r || typeof r !== "object") return false;
				const config = PDF_CONFIG[r.partNumber];
				return (
					config &&
					Number.isInteger(r.partNumber) &&
					// /section returns mapped descendants for a section prefix too.
					(r.sectionId === null || typeof r.sectionId === "string") &&
					r.pageNumber !== null &&
					Number.isInteger(r.pageNumber) &&
					r.pageNumber >= 1 &&
					r.pageNumber <= config.totalPages &&
					(r.title === null || typeof r.title === "string") &&
					typeof r.content === "string"
				);
			});
			const transformed: SpecSearchResult[] = mapped.map((r: MCPSearchResult) => ({
				id: `spec-${r.id}`,
				sectionId: r.sectionId || initialSection,
				title: r.title || r.content.slice(0, 60),
				description: r.title ? r.content.slice(0, 120) : undefined,
				partNumber: r.partNumber,
				pageNumber: r.pageNumber,
			}));

			setResults(transformed);
			setSearch(initialSection);
			setSubmittedSearch(initialSection);
			setSelectedIndex(0);
			if (transformed.length > 0) {
				setSelectedResult(transformed[0]);
				setViewerStatus("ready");
			} else {
				setSelectedResult(null);
				setViewerStatus("missing");
			}
		} catch (err) {
			if (requestId !== activeRequestId.current) return;
			console.error("Section lookup failed:", err);
			setViewerStatus("error");
		} finally {
			window.clearTimeout(timeout);
			if (requestId === activeRequestId.current) setIsLoading(false);
		}
	}, [initialSection, initialPart, cancelActiveRequest]);

	useEffect(() => {
		let active = true;
		// StrictMode's initial setup/cleanup must not cancel the only lookup or
		// issue a duplicate request. Start after that synchronous cleanup.
		queueMicrotask(() => {
			if (active && initialSection) void handleSectionLookup();
		});
		return () => {
			active = false;
			cancelActiveRequest();
		};
	}, [initialSection, handleSectionLookup, cancelActiveRequest]);

	// Auto-search or section lookup on load
	useEffect(() => {
		let active = true;
		queueMicrotask(() => {
			if (!active || hasAutoSearched.current) return;
			hasAutoSearched.current = true;
			if (!initialSection && initialQuery) void handleSubmit();
		});
		return () => {
			active = false;
		};
	}, [initialSection, initialQuery, handleSubmit]);

	// Handle Enter key to submit
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	// Scroll selected item into view
	// oxlint-disable-next-line react/exhaustive-deps -- Scroll only when the selection changes.
	useEffect(() => {
		if (resultsRef.current) {
			const selected = resultsRef.current.querySelector("[data-selected='true']");
			selected?.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	const handleSelectResult = useCallback((result: SpecSearchResult, index: number) => {
		setSelectedIndex(index);
		setSelectedResult(result);
	}, []);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle navigation when input is focused
			if (document.activeElement !== inputRef.current) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => {
					const newIndex = i < results.length - 1 ? i + 1 : i;
					setSelectedResult(results[newIndex]);
					return newIndex;
				});
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => {
					const newIndex = i > 0 ? i - 1 : 0;
					setSelectedResult(results[newIndex]);
					return newIndex;
				});
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [results]);

	// Handle page change from PDF viewer
	const handlePageChange = useCallback((page: number) => {
		// Could sync page changes back to state if needed
		console.log("Page changed to:", page);
	}, []);
	const waitingForPage = viewerStatus === "pending" || viewerStatus === "searching";
	const showingSearch = viewerStatus.startsWith("search");

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			<Navbar sticky />

			<main className="grid min-h-0 flex-1 grid-cols-[380px_1fr]">
				{/* Search panel */}
				<div className="flex min-h-0 flex-col border-r border-[var(--color-border)]">
					{/* Search input */}
					<div className="shrink-0 p-5 pb-4">
						<textarea
							ref={inputRef}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="e.g. paragraph spacing, table borders, how to style text runs..."
							rows={2}
							className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-transparent px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-text-primary)] focus:shadow-[0_0_0_3px_rgba(0,0,0,0.05)]"
							autoFocus
						/>
						<div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
							<span>Use natural language or element names</span>
							<span>
								<kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5">
									↵
								</kbd>
							</span>
						</div>
						{searchFailed && viewerStatus === "ready" && (
							<div role="alert" className="mt-4 space-y-2 text-sm">
								<p>Search unavailable. Your query is still in the search box.</p>
								<button
									type="button"
									onClick={() => void handleSubmit(true)}
									disabled={isLoading}
									className="rounded border border-[var(--color-border)] px-3 py-2 disabled:opacity-50"
								>
									Retry search
								</button>
							</div>
						)}
					</div>

					{/* Results */}
					<div className="relative min-h-0 flex-1">
						<div ref={resultsRef} className="h-full overflow-y-auto">
							{/* Results count */}
							{results.length > 0 && (
								<div className="px-5 pb-2 text-xs text-[var(--color-text-muted)]">
									{results.length} results
								</div>
							)}

							{/* Empty state */}
							{!isLoading && !submittedSearch && (
								<div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
									Search the ECMA-376 specification
								</div>
							)}

							{/* No results */}
							{!isLoading && submittedSearch && results.length === 0 && (
								<div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
									No results found
								</div>
							)}

							{/* Results list */}
							{results.map((result, idx) => (
								<button
									key={result.id}
									type="button"
									data-selected={idx === selectedIndex}
									onClick={() => handleSelectResult(result, idx)}
									onMouseEnter={() => setSelectedIndex(idx)}
									className={clsx(
										"w-full cursor-pointer border-b border-[var(--color-bg-tertiary)] px-5 py-3 text-left transition",
										idx === selectedIndex
											? "bg-[var(--color-bg-tertiary)]"
											: "hover:bg-[var(--color-bg-secondary)]",
									)}
								>
									<div className="flex items-baseline gap-2">
										<span className="shrink-0 font-mono text-[11px] font-medium text-[var(--color-accent)]">
											§{result.sectionId}
										</span>
										<span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
											{result.title}
										</span>
									</div>
									{result.description && (
										<div className="mt-1 line-clamp-1 text-xs text-[var(--color-text-muted)]">
											{result.description}
										</div>
									)}
									<div className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
										Part {result.partNumber} · Page {result.pageNumber || "—"}
									</div>
								</button>
							))}
						</div>

						{/* Loading overlay */}
						{isLoading && (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85">
								<Loader2 size={28} className="animate-spin text-[var(--color-accent)]" />
								<span className="text-sm text-[var(--color-text-secondary)]">Searching...</span>
							</div>
						)}
					</div>
				</div>

				{/* PDF viewer */}
				<div className="overflow-hidden">
					{viewerStatus === "ready" ? (
						<PdfViewer
							partNumber={selectedResult?.partNumber ?? 1}
							pageNumber={selectedResult?.pageNumber ?? 1}
							onPageChange={handlePageChange}
						/>
					) : (
						<div className="flex h-full items-center justify-center bg-[var(--color-bg-secondary)] p-8">
							<div className="max-w-md space-y-4" role={waitingForPage ? "status" : "alert"}>
								<h2 className="text-lg font-semibold">
									{showingSearch
										? viewerStatus === "searching"
											? "Searching specification"
											: viewerStatus === "search-error"
												? "Search unavailable"
												: "No search results"
										: viewerStatus === "pending"
											? "Loading requested section"
											: viewerStatus === "missing"
												? "No mapped page found"
												: "Section lookup unavailable"}
								</h2>
								<p className="text-sm text-[var(--color-text-secondary)]">
									{showingSearch
										? "Your query is still in the search box. You can retry the search, change your query, or open the official specification."
										: viewerStatus === "pending"
											? "The specification will open at the requested section when its page is available."
											: "Try the section lookup again, search for another section, or open the official PDF directly."}
								</p>
								<div className="flex flex-wrap items-center gap-4 text-sm">
									{showingSearch && !waitingForPage && (
										<button
											type="button"
											onClick={() => void handleSubmit(true)}
											disabled={isLoading}
											className="rounded border border-[var(--color-border)] px-3 py-2 disabled:opacity-50"
										>
											Retry search
										</button>
									)}
									{!waitingForPage && initialSection && (
										<button
											type="button"
											onClick={() => void handleSectionLookup()}
											disabled={isLoading}
											className="rounded border border-[var(--color-border)] px-3 py-2 disabled:opacity-50"
										>
											Retry section lookup
										</button>
									)}
									{officialPdf ? (
										<a
											href={officialPdf}
											target="_blank"
											rel="noopener noreferrer"
											className="underline"
										>
											Open official PDF
										</a>
									) : (
										Object.entries(PDF_CONFIG).map(([part, config]) => (
											<a
												key={part}
												href={config.url}
												target="_blank"
												rel="noopener noreferrer"
												className="underline"
											>
												Open Part {part} PDF
											</a>
										))
									)}
								</div>
							</div>
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
