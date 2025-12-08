# HTOS Core DNR Utilities

This document details the core utilities for managing Chrome's Declarative Net Request (DNR) API within the extension.

## Overview

The DNR utilities provide a robust, session-aware system for managing network request modifications, particularly for Arkose Enforcement (AE) header injection. The system handles service worker restarts, rule persistence, and provides debugging capabilities.

## Architecture

### Key Components

- **`dnr-utils.js`** - Core DNR utility class with header modification methods
- **`NetRulesManager.js`** - High-level network rules management with ArkoseController
- **`dnr-auditor.js`** - Debugging and audit functionality

### Design Principles

1. **DNR First** - All network modifications use declarative rules, not runtime interception
2. **Session Persistence** - Rules survive service worker restarts via chrome.storage.local
3. **Provider Scoping** - Rules are tagged by provider (chatgpt, claude, etc.) for easy cleanup
4. **Temporary Rules** - Support for time-limited rules with automatic cleanup
5. **Debug Support** - Built-in debugging via chrome.declarativeNetRequest.onRuleMatchedDebug

## API Reference

### DNRUtils Class

#### Static Methods

##### `initialize()`

Initializes the DNR utility system and restores persisted rules.

```javascript
await DNRUtils.initialize();
```

##### `registerHeaderRule(options)`

Registers a header modification rule with comprehensive options.

**Parameters:**

- `options.urlFilter` (string) - URL pattern to match (required)
- `options.headers` (object) - Headers to add/modify (required)
- `options.provider` (string) - Provider identifier for scoping
- `options.tabId` (number) - Limit rule to specific tab
- `options.duration` (number) - Auto-expire after milliseconds
- `options.priority` (number) - Rule priority (default: 1)
- `options.resourceTypes` (array) - Resource types to match (default: ['xmlhttprequest'])

**Returns:** Promise<string> - Rule ID

```javascript
const ruleId = await DNRUtils.registerHeaderRule({
  urlFilter: "https://chatgpt.com/*",
  headers: {
    "Openai-Sentinel-Chat-Requirements-Token": "token123",
    "Openai-Sentinel-Proof-Token": "proof456",
  },
  provider: "chatgpt",
  duration: 300000, // 5 minutes
});
```

##### `registerTemporaryHeaderRule(options, duration)`

Convenience method for temporary header rules.

```javascript
const ruleId = await DNRUtils.registerTemporaryHeaderRule(
  {
    urlFilter: "https://claude.ai/*",
    headers: { Authorization: "Bearer token" },
    provider: "claude",
  },
  60000,
); // 1 minute
```

##### `removeRule(ruleId)`

Removes a specific rule by ID.

```javascript
await DNRUtils.removeRule(ruleId);
```

##### `removeProviderRules(provider)`

Removes all rules associated with a provider.

```javascript
await DNRUtils.removeProviderRules("chatgpt");
```

##### `getActiveRules()`

Retrieves all active rules (dynamic and session).

```javascript
const rules = await DNRUtils.getActiveRules();
console.log("Active rules:", rules);
```

#### Debug Methods

##### `enableDebugMode()`

Enables debug logging for rule matches.

```javascript
DNRUtils.enableDebugMode();
```

##### `disableDebugMode()`

Disables debug logging.

```javascript
DNRUtils.disableDebugMode();
```

#### Cleanup Methods

##### `startPeriodicCleanup(intervalMs)`

Starts automatic cleanup of expired rules.

```javascript
DNRUtils.startPeriodicCleanup(60000); // Check every minute
```

##### `stopPeriodicCleanup()`

Stops automatic cleanup.

```javascript
DNRUtils.stopPeriodicCleanup();
```

### ArkoseController (NetRulesManager.js)

#### Methods

##### `injectAEHeaders(options)`

High-level method for AE header injection.

**Parameters:**

- `options.urlFilter` (string) - URL pattern to match
- `options.headers` (object) - AE headers to inject
- `options.provider` (string) - Provider identifier
- `options.duration` (number) - Rule duration in milliseconds

```javascript
await ArkoseController.injectAEHeaders({
  urlFilter: "https://chatgpt.com/*",
  headers: {
    "Openai-Sentinel-Chat-Requirements-Token": sentinelToken,
    "Openai-Sentinel-Proof-Token": powToken,
    "Openai-Sentinel-Arkose-Token": arkoseToken,
  },
  provider: "chatgpt",
  duration: 300000,
});
```

##### `removeAEHeaderRule(ruleId)`

Removes a specific AE header rule.

```javascript
await ArkoseController.removeAEHeaderRule(ruleId);
```

##### `removeAllAEHeaderRules(provider)`

Removes all AE header rules for a provider.

```javascript
await ArkoseController.removeAllAEHeaderRules("chatgpt");
```

## Usage Examples

### Basic Header Injection

```javascript
import { DNRUtils } from "./dnr-utils.js";

// Initialize the system
await DNRUtils.initialize();

// Inject authentication headers
const ruleId = await DNRUtils.registerHeaderRule({
  urlFilter: "https://api.example.com/*",
  headers: {
    Authorization: "Bearer " + token,
    "X-API-Key": apiKey,
  },
  provider: "example-provider",
  duration: 3600000, // 1 hour
});

// Later, remove the rule
await DNRUtils.removeRule(ruleId);
```

### Provider-Scoped Management

```javascript
// Add multiple rules for a provider
const rule1 = await DNRUtils.registerHeaderRule({
  urlFilter: "https://chatgpt.com/backend-api/*",
  headers: { "X-Custom-Header": "value1" },
  provider: "chatgpt",
});

const rule2 = await DNRUtils.registerHeaderRule({
  urlFilter: "https://chatgpt.com/api/*",
  headers: { "X-Another-Header": "value2" },
  provider: "chatgpt",
});

// Remove all rules for the provider at once
await DNRUtils.removeProviderRules("chatgpt");
```

### Tab-Specific Rules

```javascript
// Inject headers only for a specific tab
const ruleId = await DNRUtils.registerHeaderRule({
  urlFilter: "https://example.com/*",
  headers: { "X-Tab-Specific": "true" },
  tabId: 123,
  provider: "tab-provider",
});
```

### Automatic Cleanup

```javascript
// Start periodic cleanup (recommended in service worker)
DNRUtils.startPeriodicCleanup(300000); // Check every 5 minutes

// Register temporary rules that will be cleaned up automatically
const ruleId = await DNRUtils.registerTemporaryHeaderRule(
  {
    urlFilter: "https://temp.example.com/*",
    headers: { "X-Temporary": "true" },
    provider: "temp-provider",
  },
  60000,
); // Expires in 1 minute
```
