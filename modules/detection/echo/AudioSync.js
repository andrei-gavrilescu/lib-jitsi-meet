// Script expects to find rnnoise webassembly binary in the same public path root, otherwise it won't load
// During the build phase this needs to be taken care of manually
import audioSyncWasmInit from './audio_sync';

let audioSyncWasmInterface;
let initializePromise;

/**
 * Creates a new instance of RnnoiseProcessor.
 *
 * @returns {Promise<RnnoiseProcessor>}
 */
export function loadAudioSync() {
    return audioSyncWasmInit({});
    // if (!initializePromise) {
    //     initializePromise = new Promise((resolve, reject) => {
    //         audioSyncWasmInterface = audioSyncWasmInit({});
    //         return audioSyncWasmInterface;
    //     });
    // }

    // return initializePromise.then(
    //     () => audioSyncWasmInterface
    // );
}
