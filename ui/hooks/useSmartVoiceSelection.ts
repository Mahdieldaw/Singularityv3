import { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { providerAuthStatusAtom, voiceProviderAtom, mappingProviderAtom } from '../state/atoms';
import { selectSmartDefault, SYNTHESIS_PRIORITY, MAPPING_PRIORITY } from '../utils/smart-defaults';

export function useSmartVoiceSelection() {
    const authStatus = useAtomValue(providerAuthStatusAtom);
    const [voiceProvider, setVoiceProvider] = useAtom(voiceProviderAtom);
    const [mappingProvider, setMappingProvider] = useAtom(mappingProviderAtom);

    useEffect(() => {
        const locks = (() => {
            try {
                const ls = {
                    voice_locked: localStorage.getItem('htos_voice_locked') === 'true',
                    mapper_locked: localStorage.getItem('htos_mapper_locked') === 'true',
                } as any;
                return ls;
            } catch {
                return {} as any;
            }
        })();

        const bestVoice = selectSmartDefault(SYNTHESIS_PRIORITY, authStatus);
        const voiceIsAuth = !!voiceProvider && authStatus[voiceProvider] !== false;
        if (!locks.voice_locked) {
            if (!voiceProvider || !voiceIsAuth) {
                if (bestVoice) setVoiceProvider(bestVoice);
            }
        }

        const bestMapping = selectSmartDefault(MAPPING_PRIORITY, authStatus);
        const mapIsAuth = !!mappingProvider && authStatus[mappingProvider] !== false;
        if (!locks.mapper_locked) {
            if (!mappingProvider || !mapIsAuth) {
                if (bestMapping) setMappingProvider(bestMapping);
            }
        }

    }, [authStatus, voiceProvider, setVoiceProvider, mappingProvider, setMappingProvider]);
}
