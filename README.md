# Singularity

Singularity is a Chrome extension (Manifest V3) that orchestrates multi‑model AI conversations with real‑time streaming, local persistence, and reproducibility. It helps you compare providers side‑by‑side, compose their outputs, and keep a complete audit trail of every turn.

## Key Features

- **Parallel Fan-out**: Query multiple providers (ChatGPT, Claude, Gemini, Qwen) simultaneously.
- **Pipeline Workflows**: Optional breakdown into "mapping" (options analysis) and "synthesis" (consensus) steps.
- **Optimistic UI**: Immediate rendering with canonical backend ID reconciliation.
- **Local Persistence**: Append-only history in IndexedDB with fast lookups.
- **Recompute**: Re-run past steps without altering the timeline.

## Documentation

- **[Architecture Blueprint](Architecture%20Overview.md)**: High-level system map and philosophy.
- **[Critical Flows](docs/flows.md)**: Detailed sequence diagrams (Initialize, Recompute, Error).
- **[Debugging Guide](docs/debugging.md)**: Message tracing, state inspection, and common issues.readme
- **[Contributing](docs/contributing.md)**: Guide for adding new providers and primitives.
- **[Style Guide](docs/style-guide.md)**: Logo assets, sizing, and branding guidelines.
- **[Core DNR Utilities](docs/dnr-utils.md)**: Guide for managing network rules and Arkose injection.
- **[Privacy & Security](docs/privacy.md)**: Data handling and security policy.

## Architecture Summary

The system follows a clear **Resolve → Compile → Execute** pipeline:

1.  **Resolve**: Fetches context (continuation IDs, history) for the request.
2.  **Compile**: Generates a workflow plan (DAG of steps).
3.  **Execute**: Runs steps (batch prompt, mapping, synthesis), streams partial results via a central message bus, and persists to IndexedDB.

The frontend uses **Jotai** for state management (Map-based for O(1) access) and a **StreamingBuffer** for smooth 60fps updates during heavy IO.

## Directory Structure

- `src/core`: Backend pipeline (connection, resolver, compiler, engine).
- `src/providers`: LLM adapters (ChatGPT, Claude, Gemini).
- `src/persistence`: IndexedDB storage manager and schema.
- `ui`: React frontend (Vite).
- `ui/state`: Global Jotai atoms.
- `ui/assets`: Static assets and logos.
- `shared`: Types, contracts, and constants.

## Submodule Notes

### Core: DNR Utilities (`src/core`)

The `src/core` directory includes robust utilities for managing Chrome's **Declarative Net Request (DNR)** API, primarily for **Arkose Enforcement (AE)** header injection.
   
See **[docs/dnr-utils.md](docs/dnr-utils.md)** for the full architecture, API reference, and usage examples.
