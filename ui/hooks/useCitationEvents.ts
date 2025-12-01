import { useEffect } from 'react';

export function useCitationEvents(
  handleCitationClick: (num: number) => void
) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        const anchor = target
          ? (target.closest('a[href^="citation:"]') as HTMLAnchorElement | null)
          : null;
        const citeEl = target
          ? (target.closest(
              "[data-citation-number], [data-citation]",
            ) as HTMLElement | null)
          : null;
        if (!anchor && !citeEl) return;
        e.preventDefault();
        e.stopPropagation();
        let num = NaN;
        if (anchor) {
          const href = anchor.getAttribute("href") || "";
          const numMatch = href.match(/(\d+)/);
          num = numMatch ? parseInt(numMatch[1], 10) : NaN;
        } else if (citeEl) {
          const raw =
            citeEl.getAttribute("data-citation-number") ||
            citeEl.getAttribute("data-citation") ||
            "";
          const numMatch = raw.match(/(\d+)/);
          num = numMatch ? parseInt(numMatch[1], 10) : NaN;
        }
        if (!isNaN(num)) handleCitationClick(num);
      } catch (err) {
        console.warn(
          "[useCitationEvents] global citation click intercept error",
          err,
        );
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        const anchor = target
          ? (target.closest('a[href^="citation:"]') as HTMLAnchorElement | null)
          : null;
        const citeEl = target
          ? (target.closest(
              "[data-citation-number], [data-citation]",
            ) as HTMLElement | null)
          : null;
        if (!anchor && !citeEl) return;
        e.preventDefault();
        e.stopPropagation();
        let num = NaN;
        if (anchor) {
          const href = anchor.getAttribute("href") || "";
          const numMatch = href.match(/(\d+)/);
          num = numMatch ? parseInt(numMatch[1], 10) : NaN;
        } else if (citeEl) {
          const raw =
            citeEl.getAttribute("data-citation-number") ||
            citeEl.getAttribute("data-citation") ||
            "";
          const numMatch = raw.match(/(\d+)/);
          num = numMatch ? parseInt(numMatch[1], 10) : NaN;
        }
        if (!isNaN(num)) handleCitationClick(num);
      } catch (err) {
        console.warn(
          "[useCitationEvents] global citation mouseup intercept error",
          err,
        );
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        const anchor = target
          ? (target.closest('a[href^="citation:"]') as HTMLAnchorElement | null)
          : null;
        const citeEl = target
          ? (target.closest(
              "[data-citation-number], [data-citation]",
            ) as HTMLElement | null)
          : null;
        if (!anchor && !citeEl) return;
        const isAux = (e as any).button && (e as any).button !== 0;
        const isModifier = e.ctrlKey || (e as any).metaKey;
        if (isAux || isModifier) {
          e.preventDefault();
          e.stopPropagation();
          let num = NaN;
          if (anchor) {
            const href = anchor.getAttribute("href") || "";
            const numMatch = href.match(/(\d+)/);
            num = numMatch ? parseInt(numMatch[1], 10) : NaN;
          } else if (citeEl) {
            const raw =
              citeEl.getAttribute("data-citation-number") ||
              citeEl.getAttribute("data-citation") ||
              "";
            const numMatch = raw.match(/(\d+)/);
            num = numMatch ? parseInt(numMatch[1], 10) : NaN;
          }
          if (!isNaN(num)) handleCitationClick(num);
        }
      } catch (err) {
        console.warn(
          "[useCitationEvents] global citation mousedown intercept error",
          err,
        );
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        const anchor = target
          ? (target.closest('a[href^="citation:"]') as HTMLAnchorElement | null)
          : null;
        const citeEl = target
          ? (target.closest(
              "[data-citation-number], [data-citation]",
            ) as HTMLElement | null)
          : null;
        if (!anchor && !citeEl) return;
        const isAux = e.button !== 0;
        const isModifier = e.ctrlKey || (e as any).metaKey;
        if (isAux || isModifier) {
          e.preventDefault();
          e.stopPropagation();
          let num = NaN;
          if (anchor) {
            const href = anchor.getAttribute("href") || "";
            const numMatch = href.match(/(\d+)/);
            num = numMatch ? parseInt(numMatch[1], 10) : NaN;
          } else if (citeEl) {
            const raw =
              citeEl.getAttribute("data-citation-number") ||
              citeEl.getAttribute("data-citation") ||
              "";
            const numMatch = raw.match(/(\d+)/);
            num = numMatch ? parseInt(numMatch[1], 10) : NaN;
          }
          if (!isNaN(num)) handleCitationClick(num);
        }
      } catch (err) {
        console.warn(
          "[useCitationEvents] global citation pointerdown intercept error",
          err,
        );
      }
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    // Some environments dispatch auxclick for middle-click; capture to block new-tab
    document.addEventListener("auxclick", onMouseDown as any, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("auxclick", onMouseDown as any, true);
    };
  }, [handleCitationClick]);
}
