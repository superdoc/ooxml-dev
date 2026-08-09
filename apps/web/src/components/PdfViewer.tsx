import { useCallback, useEffect, useRef, useState } from "react";

/**
 * PDF URLs, sheet counts, and front-matter offsets for each part.
 *
 * `totalPages` is the number of sheets in the file - what `#page=` addresses.
 * `pageOffset` is how many sheets precede printed page 1 (cover, contents,
 * foreword). Both are measured from the published PDFs; `extract.py` prints
 * the pair for a part at the end of every extraction run.
 *
 * Search results carry the *printed* page (`spec_content.page_number`), so
 * navigating to one means adding `pageOffset` back.
 */
const PDF_CONFIG: Record<
	number,
	{ url: string; totalPages: number; pageOffset: number; name: string }
> = {
	1: {
		url: "https://cdn.ooxml.dev/ecma-376/part1.pdf",
		totalPages: 5026,
		pageOffset: 10,
		name: "Fundamentals",
	},
	2: {
		url: "https://cdn.ooxml.dev/ecma-376/part2.pdf",
		totalPages: 137,
		pageOffset: 8,
		name: "OPC",
	},
	3: {
		url: "https://cdn.ooxml.dev/ecma-376/part3.pdf",
		totalPages: 44,
		pageOffset: 6,
		name: "Compatibility",
	},
	4: {
		url: "https://cdn.ooxml.dev/ecma-376/part4.pdf",
		totalPages: 1548,
		pageOffset: 14,
		name: "Transitional",
	},
};

interface PdfViewerProps {
	partNumber: number;
	/** Printed page from the spec, as stored in `spec_content.page_number`. Null opens the cover. */
	pageNumber: number | null;
	/** Fires with the printed page now shown, or null while inside the front matter. */
	onPageChange?: (printedPage: number | null) => void;
}

export function PdfViewer({ partNumber, pageNumber, onPageChange }: PdfViewerProps) {
	const config = PDF_CONFIG[partNumber] || PDF_CONFIG[1];

	// State is the physical sheet - that is what `#page=` and the scrubber address.
	const toSheet = useCallback(
		(printed: number | null) =>
			printed === null ? 1 : Math.max(1, Math.min(printed + config.pageOffset, config.totalPages)),
		[config.pageOffset, config.totalPages],
	);
	const toPrinted = useCallback(
		(sheet: number) => (sheet > config.pageOffset ? sheet - config.pageOffset : null),
		[config.pageOffset],
	);

	const [currentSheet, setCurrentSheet] = useState(() => toSheet(pageNumber));
	const [isDragging, setIsDragging] = useState(false);
	const progressRef = useRef<HTMLDivElement>(null);

	// Sync with prop changes
	useEffect(() => {
		setCurrentSheet(toSheet(pageNumber));
	}, [pageNumber, toSheet]);

	const updateSheet = useCallback(
		(newSheet: number) => {
			const clamped = Math.max(1, Math.min(newSheet, config.totalPages));
			setCurrentSheet(clamped);
			onPageChange?.(toPrinted(clamped));
		},
		[config.totalPages, onPageChange, toPrinted],
	);

	const handlePrev = () => updateSheet(currentSheet - 1);
	const handleNext = () => updateSheet(currentSheet + 1);

	// Progress bar interaction
	const getSheetFromPosition = useCallback(
		(clientX: number) => {
			if (!progressRef.current) return currentSheet;
			const rect = progressRef.current.getBoundingClientRect();
			const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			return Math.max(1, Math.round(ratio * config.totalPages));
		},
		[config.totalPages, currentSheet],
	);

	const handleProgressClick = (e: React.MouseEvent) => {
		updateSheet(getSheetFromPosition(e.clientX));
	};

	const handleDragStart = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsDragging(true);
	};

	useEffect(() => {
		if (!isDragging) return;

		const handleMove = (e: MouseEvent) => {
			updateSheet(getSheetFromPosition(e.clientX));
		};

		const handleUp = () => {
			setIsDragging(false);
		};

		document.addEventListener("mousemove", handleMove);
		document.addEventListener("mouseup", handleUp);

		return () => {
			document.removeEventListener("mousemove", handleMove);
			document.removeEventListener("mouseup", handleUp);
		};
	}, [isDragging, getSheetFromPosition, updateSheet]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				setCurrentSheet((p) => {
					const newSheet = Math.max(1, p - 1);
					onPageChange?.(toPrinted(newSheet));
					return newSheet;
				});
			}
			if (e.key === "ArrowRight") {
				e.preventDefault();
				setCurrentSheet((p) => {
					const newSheet = Math.min(config.totalPages, p + 1);
					onPageChange?.(toPrinted(newSheet));
					return newSheet;
				});
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [config.totalPages, onPageChange, toPrinted]);

	const progressPercent = (currentSheet / config.totalPages) * 100;
	const printedPage = toPrinted(currentSheet);
	const printedTotal = config.totalPages - config.pageOffset;
	const pdfUrl = `${config.url}#page=${currentSheet}&toolbar=0&navpanes=0`;

	return (
		<div className="flex h-full flex-col bg-[var(--color-bg-secondary)]">
			{/* Toolbar */}
			<div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
				<div className="flex items-center justify-between px-5 py-2.5">
					{/* Part label */}
					<div className="text-sm text-[var(--color-text-secondary)]">
						<span className="font-medium text-[var(--color-text-primary)]">Part {partNumber}</span>
						<span className="mx-1.5">·</span>
						<span>{config.name}</span>
					</div>

					{/* Navigation controls */}
					<div className="flex items-center gap-4">
						<div className="flex gap-1">
							<button
								type="button"
								onClick={handlePrev}
								disabled={currentSheet <= 1}
								className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
								aria-label="Previous page"
							>
								←
							</button>
							<button
								type="button"
								onClick={handleNext}
								disabled={currentSheet >= config.totalPages}
								className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
								aria-label="Next page"
							>
								→
							</button>
						</div>
						<div className="flex items-baseline gap-1 text-sm">
							{printedPage === null ? (
								<span className="text-[var(--color-text-muted)]">Front matter</span>
							) : (
								<>
									<span className="font-semibold text-[var(--color-text-primary)]">
										{printedPage}
									</span>
									<span className="text-[var(--color-text-muted)]">of {printedTotal}</span>
								</>
							)}
						</div>
					</div>
				</div>

				{/* Progress bar */}
				<div
					ref={progressRef}
					onClick={handleProgressClick}
					className="group relative h-[3px] cursor-pointer bg-[var(--color-bg-tertiary)] transition-all hover:h-[5px]"
				>
					<div
						className="absolute left-0 top-0 h-full rounded-r bg-[var(--color-accent)] transition-[width] duration-200"
						style={{ width: `${progressPercent}%` }}
					/>
					<div
						onMouseDown={handleDragStart}
						className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-[var(--color-accent)] shadow-md transition-transform active:scale-110 active:cursor-grabbing group-hover:h-3.5 group-hover:w-3.5"
						style={{ left: `${progressPercent}%` }}
					/>
				</div>
			</div>

			{/* PDF iframe */}
			<div className="flex-1">
				<iframe
					key={pdfUrl}
					src={pdfUrl}
					className="h-full w-full border-0"
					title={
						printedPage === null
							? `ECMA-376 Part ${partNumber} - front matter`
							: `ECMA-376 Part ${partNumber} - page ${printedPage}`
					}
				/>
			</div>
		</div>
	);
}
