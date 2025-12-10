What component renders a single provider's response in the split pane?

Is it ProviderCard?
Something in SplitRightPane directly?
A different component?
Where does the existing recompute-batch logic live that should be reused?

Is ProviderResponseBlockConnected.handleRetryProvider still the canonical implementation?
Or has this moved/been duplicated elsewhere?
Should the error card replace the response, or appear alongside/above it?

Provider fails → show error card instead of empty response?
Provider fails → show error card + partial response if any?