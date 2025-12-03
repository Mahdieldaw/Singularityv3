import { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { providerAuthStatusAtom, voiceProviderAtom, mappingProviderAtom } from '../state/atoms';
import { selectSmartDefault, SYNTHESIS_PRIORITY, MAPPING_PRIORITY } from '../utils/smart-defaults';

export function useSmartVoiceSelection() {
    const authStatus = useAtomValue(providerAuthStatusAtom);
    const [voiceProvider, setVoiceProvider] = useAtom(voiceProviderAtom);
    const [mappingProvider, setMappingProvider] = useAtom(mappingProviderAtom);

    useEffect(() => {
        // Logic:
        // 1. If voiceProvider is null, select best.
        // 2. If voiceProvider is set but not authenticated, select best.
        // 3. If voiceProvider is set and authenticated, keep it (user preference).

        const bestVoice = selectSmartDefault(SYNTHESIS_PRIORITY, authStatus);

        if (!voiceProvider || (voiceProvider && !authStatus[voiceProvider])) {
            if (bestVoice) {
                setVoiceProvider(bestVoice);
            }
        }

        // Same for mapping
        const bestMapping = selectSmartDefault(MAPPING_PRIORITY, authStatus);
        if (!mappingProvider || (mappingProvider && !authStatus[mappingProvider])) {
            if (bestMapping) {
                setMappingProvider(bestMapping);
            }
        }

    }, [authStatus, voiceProvider, setVoiceProvider, mappingProvider, setMappingProvider]);
}
