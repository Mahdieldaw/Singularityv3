
import { ArtifactProcessor } from '../../../shared/artifact-processor';
import { PROVIDER_LIMITS } from '../../../shared/provider-limits';
import { parseGauntletOutput, parseUnderstandOutput, parseUnifiedMapperOutput, parseV1MapperToArtifact } from '../../../shared/parsing-utils';
import { classifyError } from '../error-classifier.js';
import {
  errorHandler,
  isProviderAuthError,
  createMultiProviderAuthError
} from '../../utils/ErrorHandler.js';
import { computeExplore } from '../cognitive/explore-computer';
import { classifyClaimsWithSignals, buildUnderstandSignalInjection, buildDecideSignalInjection, buildRefinerSignalInjection, buildAntagonistSignalInjection } from '../../utils/signal-router';

const WORKFLOW_DEBUG = false;
const wdbg = (...args) => {
  if (WORKFLOW_DEBUG) console.log(...args);
};

export class StepExecutor {
  constructor(orchestrator, promptService, responseProcessor, healthTracker) {
    this.orchestrator = orchestrator;
    this.promptService = promptService;
    this.responseProcessor = responseProcessor;
    this.healthTracker = healthTracker;
  }

  async executePromptStep(step, context, options) {
    const { streamingManager } = options;
    const artifactProcessor = new ArtifactProcessor();
    const {
      prompt,
      providers,
      useThinking,
      providerContexts,
      previousContext,
    } = step.payload;

    let enhancedPrompt = prompt;
    if (previousContext) {
      enhancedPrompt = `You are part of the council.Context(backdrop only—do not summarize or re - answer):

${previousContext}

Answer the user's message directly. Use context only to disambiguate.

  < user_prompt >
  ${prompt}
</user_prompt > `;
    }

    const providerStatuses = [];
    const activeProviders = [];
    try {
      for (const pid of providers) {
        const check = this.healthTracker.shouldAttempt(pid);
        if (!check.allowed) {
          providerStatuses.push({
            providerId: pid,
            status: 'skipped',
            skippedReason: check.reason || 'circuit_open',
            error: {
              type: 'circuit_open',
              message: 'Provider temporarily unavailable due to recent failures',
              retryable: true,
              retryAfterMs: check.retryAfterMs,
            },
          });
        } else {
          providerStatuses.push({ providerId: pid, status: 'queued', progress: 0 });
          activeProviders.push(pid);
        }
      }
      streamingManager.port.postMessage({
        type: 'WORKFLOW_PROGRESS',
        sessionId: context.sessionId,
        aiTurnId: context.canonicalAiTurnId || 'unknown',
        phase: 'batch',
        providerStatuses,
        completedCount: 0,
        totalCount: providers.length,
      });
    } catch (_) { }

    const promptLength = enhancedPrompt.length;
    const allowedProviders = [];
    const skippedProviders = [];
    try {
      for (const pid of activeProviders) {
        const limits = PROVIDER_LIMITS[pid];
        if (limits && promptLength > limits.maxInputChars) {
          skippedProviders.push(pid);
        } else {
          allowedProviders.push(pid);
        }
      }
      if (skippedProviders.length > 0) {
        skippedProviders.forEach((pid) => {
          try {
            const entry = providerStatuses.find((s) => s.providerId === pid);
            if (entry) {
              entry.status = 'skipped';
              entry.skippedReason = 'input_too_long';
              entry.error = { type: 'input_too_long', message: `Prompt length ${promptLength} exceeds limit for ${pid}`, retryable: true };
            } else {
              providerStatuses.push({ providerId: pid, status: 'skipped', skippedReason: 'input_too_long', error: { type: 'input_too_long', message: `Prompt length ${promptLength} exceeds limit for ${pid}`, retryable: true } });
            }
          } catch (_) { }
        });
        try {
          streamingManager.port.postMessage({
            type: 'WORKFLOW_PROGRESS',
            sessionId: context.sessionId,
            aiTurnId: context.canonicalAiTurnId || 'unknown',
            phase: 'batch',
            providerStatuses,
            completedCount: providerStatuses.filter((p) => p.status === 'completed').length,
            totalCount: providerStatuses.length,
          });
        } catch (_) { }
      }
      if (allowedProviders.length === 0) {
        throw new Error(`INPUT_TOO_LONG: Prompt length ${promptLength} exceeds limits for all selected providers`);
      }
    } catch (e) {
      return Promise.reject(e);
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(enhancedPrompt, allowedProviders, {
        sessionId: context.sessionId,
        useThinking,
        providerContexts,
        providerMeta: step?.payload?.providerMeta,
        onPartial: (providerId, chunk) => {
          streamingManager.dispatchPartialDelta(
            context.sessionId,
            step.stepId,
            providerId,
            chunk.text,
            "Prompt",
          );
          try {
            const entry = providerStatuses.find((s) => s.providerId === providerId);
            if (entry) {
              entry.status = 'streaming';
              entry.progress = undefined;
              streamingManager.port.postMessage({
                type: 'WORKFLOW_PROGRESS',
                sessionId: context.sessionId,
                aiTurnId: context.canonicalAiTurnId || 'unknown',
                phase: 'batch',
                providerStatuses,
                completedCount: providerStatuses.filter((p) => p.status === 'completed').length,
                totalCount: providers.length,
              });
            }
          } catch (_) { }
        },
        onProviderComplete: (providerId, _resultWrapper) => {
          try {
            this.healthTracker.recordSuccess(providerId);
            const entry = providerStatuses.find((s) => s.providerId === providerId);
            if (entry) {
              entry.status = 'completed';
              entry.progress = 100;
              if (entry.error) delete entry.error;

              streamingManager.port.postMessage({
                type: 'WORKFLOW_PROGRESS',
                sessionId: context.sessionId,
                aiTurnId: context.canonicalAiTurnId || 'unknown',
                phase: 'batch',
                providerStatuses,
                completedCount: providerStatuses.filter((p) => p.status === 'completed').length,
                totalCount: providers.length,
              });
            }
          } catch (_) { }
        },
        onError: (error) => {
          try {
            streamingManager.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "partial_failure",
              error: error?.message || String(error),
            });
          } catch (_) { }
        },
        onAllComplete: (results, errors) => {
          const batchUpdates = {};
          results.forEach((res, pid) => {
            batchUpdates[pid] = res;
          });

          // ✅ CRITICAL: Update in-memory cache SYNCHRONOUSLY
          options.persistenceCoordinator.updateProviderContextsBatch(
            context.sessionId,
            batchUpdates,
            true, // continueThread
            { skipSave: true },
          );

          // Update contexts async
          options.persistenceCoordinator.persistProviderContextsAsync(context.sessionId, batchUpdates);

          const formattedResults = {};
          const authErrors = [];

          results.forEach((result, providerId) => {
            const processed = artifactProcessor.process(result.text || '');
            formattedResults[providerId] = {
              providerId: providerId,
              text: processed.cleanText,
              status: "completed",
              meta: result.meta || {},
              artifacts: processed.artifacts,
              ...(result.softError ? { softError: result.softError } : {}),
            };
            try {
              this.healthTracker.recordSuccess(providerId);
              const entry = providerStatuses.find((s) => s.providerId === providerId);
              if (entry) {
                entry.status = 'completed';
                entry.progress = 100;
                if (entry.error) delete entry.error;
              }
            } catch (_) { }
          });

          errors.forEach((error, providerId) => {
            formattedResults[providerId] = {
              providerId: providerId,
              text: "",
              status: "failed",
              meta: { _rawError: error.message },
            };

            if (isProviderAuthError(error)) {
              authErrors.push(error);
            }
            try {
              this.healthTracker.recordFailure(providerId, error);
              const classified = classifyError(error);
              const entry = providerStatuses.find((s) => s.providerId === providerId);
              if (entry) {
                entry.status = 'failed';
                entry.error = classified;
              }
            } catch (_) { }
          });

          const hasAnyValidResults = Object.values(formattedResults).some(
            (r) =>
              r.status === "completed" && r.text && r.text.trim().length > 0,
          );

          // ✅ CRITICAL FIX: Ensure skipped/failed providers are included in formattedResults
          providerStatuses.forEach(p => {
            if ((p.status === 'skipped' || p.status === 'failed') && !formattedResults[p.providerId]) {
              formattedResults[p.providerId] = {
                providerId: p.providerId,
                text: "",
                status: p.status === 'skipped' ? 'skipped' : 'failed', // Map to valid status
                meta: {
                  error: p.error?.message || p.skippedReason || "Skipped or failed",
                  skipped: p.status === 'skipped',
                  reason: p.skippedReason
                }
              };
            }
          });

          if (!hasAnyValidResults) {
            if (authErrors.length > 0 && authErrors.length === errors.size) {
              const providerIds = Array.from(errors.keys());
              reject(createMultiProviderAuthError(providerIds, "Multiple authentication errors occurred."));
              return;
            }

            // Even if no valid results, we might want to return the skipped/failed ones instead of rejecting
            // if we want the UI to show them as "failed" orbs.
            if (providerStatuses.length > 0) {
              resolve({
                results: formattedResults,
                errors: Object.fromEntries(errors),
              });
              return;
            }

            reject(
              new Error("All providers failed or returned empty responses"),
            );
            return;
          }

          try {
            const completedCount = providerStatuses.filter((p) => p.status === 'completed').length;
            streamingManager.port.postMessage({
              type: 'WORKFLOW_PROGRESS',
              sessionId: context.sessionId,
              aiTurnId: context.canonicalAiTurnId || 'unknown',
              phase: 'batch',
              providerStatuses,
              completedCount,
              totalCount: providers.length,
            });

            const failedProviders = providerStatuses.filter((p) => p.status === 'failed');
            const successfulProviders = providerStatuses.filter((p) => p.status === 'completed');
            if (failedProviders.length > 0) {
              streamingManager.port.postMessage({
                type: 'WORKFLOW_PARTIAL_COMPLETE',
                sessionId: context.sessionId,
                aiTurnId: context.canonicalAiTurnId || 'unknown',
                successfulProviders: successfulProviders.map((p) => p.providerId),
                failedProviders: failedProviders.map((p) => ({ providerId: p.providerId, error: p.error })),
                mappingCompleted: false,
              });
            }
          } catch (_) { }

          resolve({
            results: formattedResults,
            errors: Object.fromEntries(errors),
          });
        },
      });
    });
  }

  async executeMappingStep(step, context, stepResults, workflowContexts, resolvedContext, options) {
    const { streamingManager, contextManager, persistenceCoordinator } = options;
    const artifactProcessor = new ArtifactProcessor();
    const payload = step.payload;
    const sourceData = await this._resolveSourceData(
      payload,
      context,
      stepResults,
      options
    );

    if (sourceData.length < 2) {
      throw new Error(
        `Mapping requires at least 2 valid sources, but found ${sourceData.length}.`,
      );
    }

    wdbg(
      `[StepExecutor] Running mapping with ${sourceData.length
      } sources: ${sourceData.map((s) => s.providerId).join(", ")} `,
    );

    const providerOrder = Array.isArray(payload.providerOrder)
      ? payload.providerOrder
      : sourceData.map((s) => s.providerId);
    const citationOrder = providerOrder.filter((pid) =>
      sourceData.some((s) => s.providerId === pid),
    );

    const mappingPrompt = this.promptService.buildMappingPrompt(
      payload.originalPrompt,
      sourceData,
      citationOrder,
    );

    const providerContexts = contextManager.resolveProviderContext(
      payload.mappingProvider,
      context,
      payload,
      workflowContexts,
      stepResults,
      resolvedContext,
      "Mapping",
    );

    const promptLength = mappingPrompt.length;
    console.log(`[StepExecutor] Mapping prompt length for ${payload.mappingProvider}: ${promptLength} chars`);

    const limits = PROVIDER_LIMITS[payload.mappingProvider];
    if (limits && promptLength > limits.maxInputChars) {
      console.warn(`[StepExecutor] Mapping prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${payload.mappingProvider}`);
      throw new Error(`INPUT_TOO_LONG: Prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${payload.mappingProvider}`);
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(
        mappingPrompt,
        [payload.mappingProvider],
        {
          sessionId: context.sessionId,
          useThinking: payload.useThinking,
          providerContexts: Object.keys(providerContexts).length
            ? providerContexts
            : undefined,
          providerMeta: step?.payload?.providerMeta,
          onPartial: (providerId, chunk) => {
            streamingManager.dispatchPartialDelta(
              context.sessionId,
              step.stepId,
              providerId,
              chunk.text,
              "Mapping",
            );
          },
          onAllComplete: (results, errors) => {
            let finalResult = results.get(payload.mappingProvider);
            const providerError = errors?.get?.(payload.mappingProvider);

            if ((!finalResult || !finalResult.text) && providerError) {
              const recovered = streamingManager.getRecoveredText(
                context.sessionId, step.stepId, payload.mappingProvider
              );

              if (recovered && recovered.trim().length > 0) {
                finalResult = finalResult || { providerId: payload.mappingProvider, meta: {} };
                finalResult.text = recovered;
                finalResult.softError = finalResult.softError || {
                  message: providerError?.message || String(providerError),
                };
              }
            }

            let graphTopology = null;
            let allOptions = null;
            let mapperArtifact = null;

            if (finalResult?.text) {
              const unifiedResult = parseUnifiedMapperOutput(finalResult.text);

              graphTopology = unifiedResult.topology;
              allOptions = unifiedResult.options;

              if (unifiedResult.artifact || unifiedResult.map) {
                const base = unifiedResult.artifact || unifiedResult.map;
                mapperArtifact = {
                  ...base,
                  query: payload.originalPrompt,
                  turn: context.turn || 0,
                  timestamp: new Date().toISOString(),
                  model_count: citationOrder.length,
                  souvenir: base.souvenir || ""
                };
              }

              const processed = artifactProcessor.process(unifiedResult.narrative || finalResult.text);
              finalResult.text = processed.cleanText;
              finalResult.artifacts = processed.artifacts;
            }

            if (finalResult?.text) {
              streamingManager.dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                payload.mappingProvider,
                finalResult.text,
                "Mapping",
                true,
              );
            }

            if (!finalResult || !finalResult.text) {
              if (providerError) {
                reject(providerError);
              } else {
                reject(
                  new Error(
                    `Mapping provider ${payload.mappingProvider} returned empty response`,
                  ),
                );
              }
              return;
            }

            const citationSourceOrder = {};
            citationOrder.forEach((pid, idx) => {
              citationSourceOrder[idx + 1] = pid;
            });
            const finalResultWithMeta = {
              ...finalResult,
              meta: {
                ...(finalResult?.meta || {}),
                citationSourceOrder,
                ...(allOptions ? { allAvailableOptions: allOptions } : {}),
                ...(graphTopology ? { graphTopology } : {}),
              },
            };

            persistenceCoordinator.persistProviderContextsAsync(context.sessionId, {
              [payload.mappingProvider]: finalResultWithMeta,
            });

            try {
              if (finalResultWithMeta?.meta) {
                workflowContexts[payload.mappingProvider] =
                  finalResultWithMeta.meta;
                wdbg(
                  `[StepExecutor] Updated workflow context for ${payload.mappingProvider
                  }: ${Object.keys(finalResultWithMeta.meta).join(",")} `,
                );
              }
            } catch (_) { }

            resolve({
              providerId: payload.mappingProvider,
              text: finalResultWithMeta.text,
              status: "completed",
              meta: finalResultWithMeta.meta || {},
              artifacts: finalResult.artifacts || [],
              mapperArtifact: mapperArtifact,
              ...(finalResult.softError ? { softError: finalResult.softError } : {}),
            });
          },
        },
      );
    });
  }

  // Refiner, Antagonist, Explore, Understand, Gauntlet implementations follow similar patterns
  // I'll condense them here assuming they use similar shared logic for resolving sources

  async _resolveSourceData(payload, context, previousResults, options) {
    const { sessionManager } = options;
    if (payload.sourceHistorical) {
      // Historical source
      const { turnId, responseType } = payload.sourceHistorical;
      console.log(
        `[StepExecutor] Resolving historical data from turn: ${turnId} `,
      );

      // Prefer adapter lookup
      let aiTurn = null;
      try {
        const adapter = sessionManager?.adapter;
        if (adapter?.isReady && adapter.isReady()) {
          const turn = await adapter.get("turns", turnId);
          if (turn && (turn.type === "ai" || turn.role === "assistant")) {
            aiTurn = turn;
          } else if (turn && turn.type === "user") {
            try {
              const sessionTurns = await adapter.getTurnsBySessionId(context.sessionId);
              if (Array.isArray(sessionTurns)) {
                const userIdx = sessionTurns.findIndex(t => t.id === turnId);
                if (userIdx !== -1) {
                  const next = sessionTurns[userIdx + 1];
                  if (next && (next.type === "ai" || next.role === "assistant")) {
                    aiTurn = next;
                  }
                }
              }
            } catch (ignored) { }
          }
        }
      } catch (e) {
        console.warn("[StepExecutor] resolveSourceData adapter lookup failed:", e);
      }

      if (!aiTurn) {
        // Try text matching fallback if ID lookup failed (via adapter)
        const fallbackText = context?.userMessage || "";
        if (fallbackText && fallbackText.trim().length > 0 && sessionManager?.adapter?.isReady && sessionManager.adapter.isReady()) {
          try {
            const sessionTurns = await sessionManager.adapter.getTurnsBySessionId(context.sessionId);
            if (Array.isArray(sessionTurns)) {
              for (let i = 0; i < sessionTurns.length; i++) {
                const t = sessionTurns[i];
                if (t && t.type === "user" && String(t.text || "") === String(fallbackText)) {
                  const next = sessionTurns[i + 1];
                  if (next && next.type === "ai") {
                    aiTurn = next;
                    break;
                  }
                }
              }
            }
          } catch (e) {
            throw new Error(`Could not find corresponding AI turn for ${turnId} (text fallback failed)`);
          }
        }

        if (!aiTurn) {
          console.warn(`[StepExecutor] Could not resolve AI turn for source ${turnId}`);
          return [];
        }
      }

      let sourceContainer;
      switch (responseType) {
        case "mapping": sourceContainer = aiTurn.mappingResponses || {}; break;
        case "refiner": sourceContainer = aiTurn.refinerResponses || {}; break;
        case "antagonist": sourceContainer = aiTurn.antagonistResponses || {}; break;
        default: sourceContainer = aiTurn.batchResponses || {}; break;
      }

      const latestMap = new Map();
      Object.keys(sourceContainer).forEach(pid => {
        const versions = (sourceContainer[pid] || [])
          .filter(r => r.status === "completed" && r.text?.trim())
          .sort((a, b) => (b.responseIndex || 0) - (a.responseIndex || 0));

        if (versions.length > 0) {
          latestMap.set(pid, {
            providerId: pid,
            text: versions[0].text
          });
        }
      });

      let sourceArray = Array.from(latestMap.values());

      // If embedded responses were not present, attempt provider_responses fallback (prefer indexed lookup)
      if (
        sourceArray.length === 0 &&
        sessionManager?.adapter?.isReady &&
        sessionManager.adapter.isReady()
      ) {
        try {
          const responses = await sessionManager.adapter.getResponsesByTurnId(
            aiTurn.id,
          );

          const respType = responseType || "batch";
          const dbLatestMap = new Map();

          (responses || [])
            .filter(r => r?.responseType === respType && r.text?.trim())
            .forEach(r => {
              const existing = dbLatestMap.get(r.providerId);
              if (!existing || (r.responseIndex || 0) >= (existing.responseIndex || 0)) {
                dbLatestMap.set(r.providerId, r);
              }
            });

          sourceArray = Array.from(dbLatestMap.values()).map(r => ({
            providerId: r.providerId,
            text: r.text
          }));
          if (sourceArray.length > 0) {
            console.log(
              "[StepExecutor] provider_responses fallback succeeded for historical sources",
            );
          }
        } catch (e) {
          console.warn(
            "[StepExecutor] provider_responses fallback failed for historical sources:",
            e,
          );
        }
      }

      console.log(
        `[StepExecutor] Found ${sourceArray.length} historical sources`,
      );
      return sourceArray;

    } else if (payload.sourceStepIds) {
      const sourceArray = [];
      for (const stepId of payload.sourceStepIds) {
        const stepResult = previousResults.get(stepId);
        if (!stepResult || stepResult.status !== "completed") continue;
        const { results } = stepResult.result;
        Object.entries(results).forEach(([providerId, result]) => {
          if (result.status === "completed" && result.text && result.text.trim().length > 0) {
            sourceArray.push({
              providerId: providerId,
              text: result.text,
            });
          }
        });
      }
      return sourceArray;
    }
    throw new Error("No valid source specified for step.");
  }

  async _executeGenericSingleStep(step, context, providerId, prompt, stepType, options, parseOutputFn) {
    const { streamingManager, persistenceCoordinator } = options;
    const { payload } = step;

    console.log(`[StepExecutor] ${stepType} prompt for ${providerId}: ${prompt.length} chars`);

    // 1. Check Limits
    const limits = PROVIDER_LIMITS[providerId];
    if (limits && prompt.length > limits.maxInputChars) {
      console.warn(`[StepExecutor] ${stepType} prompt length ${prompt.length} exceeds limit ${limits.maxInputChars} for ${providerId}`);
      throw new Error(`INPUT_TOO_LONG: Prompt length ${prompt.length} exceeds limit ${limits.maxInputChars} for ${providerId}`);
    }

    const runRequest = async (pid) => {
      return new Promise((resolve, reject) => {
        this.orchestrator.executeParallelFanout(
          prompt,
          [pid],
          {
            sessionId: context.sessionId,
            useThinking: payload.useThinking || false,
            onPartial: (id, chunk) => {
              streamingManager.dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                id,
                chunk.text,
                stepType
              );
            },
            onAllComplete: (results, errors) => {
              let finalResult = results.get(pid);
              const providerError = errors?.get?.(pid);

              // 2. Partial Recovery
              if ((!finalResult || !finalResult.text) && providerError) {
                const recovered = streamingManager.getRecoveredText(
                  context.sessionId, step.stepId, pid
                );
                if (recovered && recovered.trim().length > 0) {
                  finalResult = finalResult || { providerId: pid, meta: {} };
                  finalResult.text = recovered;
                  finalResult.softError = finalResult.softError || {
                    message: providerError?.message || String(providerError),
                  };
                } else {
                  reject(providerError);
                  return;
                }
              }

              if (finalResult?.text) {
                // 3. Parse Output
                let outputData = null;
                try {
                  outputData = parseOutputFn(finalResult.text);
                } catch (parseErr) {
                  console.warn(`[StepExecutor] Output parsing failed for ${stepType}:`, parseErr);
                  // We continue with raw text if parsing fails, but mark it? 
                  // For now, allow specific parsers to handle robustness or throw.
                }

                streamingManager.dispatchPartialDelta(
                  context.sessionId,
                  step.stepId,
                  pid,
                  finalResult.text,
                  stepType,
                  true
                );

                // 4. Persist Context
                persistenceCoordinator.persistProviderContextsAsync(context.sessionId, {
                  [pid]: finalResult,
                });

                resolve({
                  providerId: pid,
                  text: finalResult.text,
                  status: "completed",
                  meta: {
                    ...finalResult.meta,
                    ...(outputData ? { [`${stepType.toLowerCase()}Output`]: outputData } : {})
                  },
                  output: outputData, // Standardize output access
                  ...(finalResult.softError ? { softError: finalResult.softError } : {}),
                });
              } else {
                reject(new Error(`Empty response from ${stepType} provider`));
              }
            }
          }
        );
      });
    };

    // 5. Auth Fallback Wrapper
    try {
      return await runRequest(providerId);
    } catch (error) {
      if (isProviderAuthError(error)) {
        console.warn(`[StepExecutor] ${stepType} failed with auth error for ${providerId}, attempting fallback...`);
        const fallbackStrategy = errorHandler.fallbackStrategies.get('PROVIDER_AUTH_FAILED');
        if (fallbackStrategy) {
          try {
            const fallbackProvider = await fallbackStrategy(
              stepType.toLowerCase(),
              { failedProviderId: providerId }
            );
            if (fallbackProvider) {
              console.log(`[StepExecutor] Executing ${stepType} with fallback provider: ${fallbackProvider}`);
              return await runRequest(fallbackProvider);
            }
          } catch (fallbackError) {
            console.warn(`[StepExecutor] Fallback failed: `, fallbackError);
          }
        }
      }
      throw error;
    }
  }

  async executeRefinerStep(step, context, stepResults, options) {
    const { responseProcessor } = this;
    const payload = step.payload;
    const {
      refinerProvider,
      sourceStepIds,
      originalPrompt,
      mappingStepIds,
      sourceHistorical
    } = payload;

    let batchResponses = {};
    let mappingText = "";
    let understandOutput = payload.understandOutput || null;
    let gauntletOutput = payload.gauntletOutput || null;

    if (sourceHistorical) {
      const { turnId } = sourceHistorical;
      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'batch' } }, context, stepResults, options);
        data.forEach(item => {
          if (item.text) batchResponses[item.providerId] = { text: item.text, providerId: item.providerId };
        });
      } catch (_) { }

      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'understand' } }, context, stepResults, options);
        if (data[0]?.meta?.understandOutput) understandOutput = data[0].meta.understandOutput;
      } catch (_) { }
      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'gauntlet' } }, context, stepResults, options);
        if (data[0]?.meta?.gauntletOutput) gauntletOutput = data[0].meta.gauntletOutput;
      } catch (_) { }

      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'mapping' } }, context, stepResults, options);
        const raw = data[0]?.text || "";
        if (raw) mappingText = responseProcessor.processMappingResponse(raw).text;
      } catch (_) { }

    } else {
      const batchStepResults = stepResults.get(sourceStepIds?.[0])?.result?.results || {};
      Object.entries(batchStepResults).forEach(([pid, res]) => {
        if (res && res.text) batchResponses[pid] = { text: res.text, providerId: pid };
      });

      if (mappingStepIds && mappingStepIds.length > 0) {
        for (const id of mappingStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed" && res.result?.text) {
            const raw = res.result.text;
            mappingText = responseProcessor.processMappingResponse(raw).text;
            break;
          }
        }
      }
    }

    let refinerPrompt = this.promptService.buildRefinerPrompt({
      originalPrompt,
      mappingText,
      batchResponses,
      understandOutput,
      gauntletOutput,
      mapperArtifact: payload.mapperArtifact
    });

    try {
      const adapter = options.sessionManager?.adapter;
      if (adapter && adapter.isReady && adapter.isReady()) {
        const aiTurn = await adapter.get("turns", context.canonicalAiTurnId);
        const edits = aiTurn?.artifactEdit || null;
        let artifact = payload.mapperArtifact || null;
        if (!artifact && mappingText) {
          artifact = parseV1MapperToArtifact(mappingText, {
            graphTopology: payload?.mappingMeta?.graphTopology,
            query: originalPrompt,
          });
        }
        if (artifact) {
          const classified = classifyClaimsWithSignals(artifact, edits);
          const inputType = understandOutput ? "understand" : "decide";
          const injection = buildRefinerSignalInjection(classified, inputType);
          if (injection && injection.length > 0) {
            refinerPrompt += injection;
          }
        }
      }
    } catch (_) { }

    return this._executeGenericSingleStep(
      step, context, refinerProvider, refinerPrompt, "Refiner", options,
      (text) => responseProcessor.parseRefinerResponse(responseProcessor.extractContent(text))
    );
  }

  async executeAntagonistStep(step, context, stepResults, options) {
    const { responseProcessor } = this;
    const payload = step.payload;
    const {
      antagonistProvider,
      sourceStepIds,
      originalPrompt,
      mappingStepIds,
      refinerStepIds,
      sourceHistorical
    } = payload;

    let batchResponses = {};
    let fullOptionsText = "";
    let refinerOutput = null;
    let understandOutput = payload.understandOutput || null;
    let gauntletOutput = payload.gauntletOutput || null;

    if (sourceHistorical) {
      const { turnId } = sourceHistorical;
      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'batch' } }, context, stepResults, options);
        data.forEach(item => {
          if (item.text) batchResponses[item.providerId] = { text: item.text, providerId: item.providerId };
        });
      } catch (_) { }

      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'understand' } }, context, stepResults, options);
        if (data[0]?.meta?.understandOutput) understandOutput = data[0].meta.understandOutput;
      } catch (_) { }
      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'gauntlet' } }, context, stepResults, options);
        if (data[0]?.meta?.gauntletOutput) gauntletOutput = data[0].meta.gauntletOutput;
      } catch (_) { }

      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'mapping' } }, context, stepResults, options);
        if (data[0]?.text) {
          const parsed = responseProcessor.processMappingResponse(data[0].text);
          fullOptionsText = parsed.options || "";
        }
      } catch (_) { }
      try {
        const data = await this._resolveSourceData({ sourceHistorical: { turnId, responseType: 'refiner' } }, context, stepResults, options);
        if (data[0]?.text) refinerOutput = responseProcessor.parseRefinerResponse(data[0].text);
      } catch (_) { }

    } else {
      const batchStepResults = stepResults.get(sourceStepIds?.[0])?.result?.results || {};
      Object.entries(batchStepResults).forEach(([pid, res]) => {
        if (res && res.text) batchResponses[pid] = { text: res.text, providerId: pid };
      });

      if (mappingStepIds) {
        for (const id of mappingStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed" && res.result?.text) {
            const parsed = responseProcessor.processMappingResponse(res.result.text);
            fullOptionsText = parsed.options || "";
          }
        }
      }
      if (refinerStepIds) {
        for (const id of refinerStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed") {
            refinerOutput = res.result.output || responseProcessor.parseRefinerResponse(res.result.text);
          }
        }
      }
    }

    const modelCount = Object.keys(batchResponses).length;
    const modelOutputsBlock = Object.entries(batchResponses)
      .map(([providerId, response], idx) => {
        return `<model_${idx + 1} provider="${providerId}">\n${response.text}\n</model_${idx + 1}>`;
      })
      .join('\n\n');

    let antagonistPrompt = this.promptService.buildAntagonistPrompt(
      originalPrompt,
      fullOptionsText,
      modelOutputsBlock,
      refinerOutput,
      modelCount,
      understandOutput,
      gauntletOutput
    );

    try {
      const adapter = options.sessionManager?.adapter;
      if (adapter && adapter.isReady && adapter.isReady()) {
        const aiTurn = await adapter.get("turns", context.canonicalAiTurnId);
        const edits = aiTurn?.artifactEdit || null;
        let artifact = payload.mapperArtifact || null;
        if (!artifact && fullOptionsText) {
          const mapText = fullOptionsText;
          artifact = parseV1MapperToArtifact(mapText, {
            graphTopology: payload?.mappingMeta?.graphTopology,
            query: originalPrompt,
          });
        }
        if (artifact) {
          const classified = classifyClaimsWithSignals(artifact, edits);
          const inputType = understandOutput ? "understand" : "decide";
          const ghostOverride = edits?.ghostOverride || null;
          const injection = buildAntagonistSignalInjection(classified, inputType, ghostOverride);
          if (injection && injection.length > 0) {
            antagonistPrompt += injection;
          }
        }
      }
    } catch (_) { }

    return this._executeGenericSingleStep(
      step, context, antagonistProvider, antagonistPrompt, "Antagonist", options,
      (text) => responseProcessor.extractContent(text)
    );
  }

  async executeUnderstandStep(step, context, _previousResults, options) {
    const payload = step.payload;

    const mapperArtifact =
      payload.mapperArtifact ||
      (payload.mappingText
        ? parseV1MapperToArtifact(payload.mappingText, {
          graphTopology: payload?.mappingMeta?.graphTopology,
          query: payload.originalPrompt,
        })
        : null);

    const exploreAnalysis =
      payload.exploreAnalysis ||
      (mapperArtifact ? computeExplore(payload.originalPrompt, mapperArtifact) : null);

    if (!mapperArtifact) {
      throw new Error("Understand mode requires a MapperArtifact.");
    }

    let narrativeSummary = "";

    const mappingText = payload.mappingText || "";
    if (mappingText) {
      const parsed = parseUnifiedMapperOutput(mappingText);
      narrativeSummary = parsed.narrative;
    }

    let understandPrompt = this.promptService.buildUnderstandPrompt(
      payload.originalPrompt,
      mapperArtifact,
      narrativeSummary,
      payload.userNotes
    );

    try {
      const adapter = options.sessionManager?.adapter;
      if (adapter && adapter.isReady && adapter.isReady()) {
        const aiTurn = await adapter.get("turns", context.canonicalAiTurnId);
        const edits = aiTurn?.artifactEdit || null;
        const classified = classifyClaimsWithSignals(mapperArtifact, edits);
        const injection = buildUnderstandSignalInjection(classified);
        if (injection && injection.length > 0) {
          understandPrompt += injection;
        }
      }
    } catch (_) { }

    if (Array.isArray(payload.selectedArtifacts) && payload.selectedArtifacts.length > 0) {
      const selectionLines = payload.selectedArtifacts.map((a, index) => {
        const header = `Selection ${index + 1} [${a.kind || "artifact"}]`;
        const source = a.source ? `Source: ${a.source}` : "";
        const dim = a.dimension ? `Dimension: ${a.dimension}` : "";
        const metaLines = [];
        const meta = a.meta || {};
        if (meta.applies_when) metaLines.push(`Applies when: ${meta.applies_when}`);
        if (typeof meta.support_count === "number") metaLines.push(`Support count: ${meta.support_count}`);
        return `${header}\n${source}${source && dim ? " • " : ""}${dim}\nText: ${a.text}\n${metaLines.join("\n")}`.trim();
      });
      understandPrompt += `\n\n<USER_SELECTED_ARTIFACTS>\n${selectionLines.join("\n\n")}\n</USER_SELECTED_ARTIFACTS>`;
    }

    return this._executeGenericSingleStep(
      step, context, payload.understandProvider, understandPrompt, "Understand", options,
      (text) => parseUnderstandOutput(text)
    );
  }

  async executeGauntletStep(step, context, _previousResults, options) {
    const payload = step.payload;

    const mapperArtifact =
      payload.mapperArtifact ||
      (payload.mappingText
        ? parseV1MapperToArtifact(payload.mappingText, {
          graphTopology: payload?.mappingMeta?.graphTopology,
          query: payload.originalPrompt,
        })
        : null);

    if (!mapperArtifact) {
      throw new Error("Gauntlet requires a MapperArtifact but none was provided.");
    }

    let narrativeSummary = "";
    const mappingText = payload.mappingText || "";
    if (mappingText) {
      const parsed = parseUnifiedMapperOutput(mappingText);
      narrativeSummary = parsed.narrative;
    }

    let gauntletPrompt = this.promptService.buildGauntletPrompt(
      payload.originalPrompt,
      mapperArtifact,
      narrativeSummary,
      payload.userNotes
    );

    try {
      const adapter = options.sessionManager?.adapter;
      if (adapter && adapter.isReady && adapter.isReady()) {
        const aiTurn = await adapter.get("turns", context.canonicalAiTurnId);
        const edits = aiTurn?.artifactEdit || null;
        const classified = classifyClaimsWithSignals(mapperArtifact, edits);
        const injection = buildDecideSignalInjection(classified);
        if (injection && injection.length > 0) {
          gauntletPrompt += injection;
        }
      }
    } catch (_) { }

    if (Array.isArray(payload.selectedArtifacts) && payload.selectedArtifacts.length > 0) {
      const selectionLines = payload.selectedArtifacts.map((a, index) => {
        const header = `Selection ${index + 1} [${a.kind || "artifact"}]`;
        const source = a.source ? `Source: ${a.source}` : "";
        const dim = a.dimension ? `Dimension: ${a.dimension}` : "";
        const metaLines = [];
        const meta = a.meta || {};
        if (meta.applies_when) metaLines.push(`Applies when: ${meta.applies_when}`);
        if (typeof meta.support_count === "number") metaLines.push(`Support count: ${meta.support_count}`);
        return `${header}\n${source}${source && dim ? " • " : ""}${dim}\nText: ${a.text}\n${metaLines.join("\n")}`.trim();
      });
      gauntletPrompt += `\n\n<USER_SELECTED_ARTIFACTS>\n${selectionLines.join("\n\n")}\n</USER_SELECTED_ARTIFACTS>`;
    }

    return this._executeGenericSingleStep(
      step, context, payload.gauntletProvider, gauntletPrompt, "Gauntlet", options,
      (text) => parseGauntletOutput(text)
    );
  }

}
