# Privacy & Security

## Core Principles

- **No secrets committed to code**: Keep credentials in environment variables or provider settings.
- **Data stays local**: Conversation history and state are stored locally in your browser’s IndexedDB. No data is sent to a central server other than the AI providers you explicitly configure.
- **"Code is truth"**: We prioritize observed behavior and running systems over assumptions.

## Data Handling

- **API Keys**: Stored in local storage or session memory, never transmitted except to the provider API.
- **History**: Persisted in `HTOSPersistenceDB` (IndexedDB) within the browser extension sandbox.
