import EventEmitter from 'events';
import * as JitsiConferenceEvents from '../../../JitsiConferenceEvents';
import PCMGenerator from './PCMGenerator';
import { PCM_SAMPLE_PUBLISHED, ECHO_DETECTED } from '../DetectionEvents';
import { loadAudioSync } from './AudioSync';
import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);

/**
 * Sample rate of TrackVADEmitter, it defines how many audio samples are processed at a time.
 * @type {number}
 */
const PCM_SAMPLE_RATE = 16384;

/**
 * Time span over which we calculate an average score used to determine if we trigger the event.
 * @type {number}
 */
const PCM_SAMPLE_FREQUENCY = 44100;

/**
 * Time span over which we calculate an average score used to determine if we trigger the event.
 * @type {number}
 */
// const LOCAL_SAMPLE_SIZE = 11025;

/**
 * Time span over which we calculate an average score used to determine if we trigger the event.
 * @type {number}
 */
const REMOTE_BUFFER_SAMPLE_SIZE = 22050;

/**
 * Time span over which we calculate an average score used to determine if we trigger the event.
 * @type {number}
 */
const LOCAL_SAMPLE_ARRAY_SIZE = 8;

/**
 * Place holder.
 */
export default class EchoDetector extends EventEmitter {

    /**
     * Place holder.
     * @param {*} conference
     */
    static create(conference) {
        return new EchoDetector(conference);
    }

    /**
     * Place Holder
     * @param {*} conference - Place holder.
     */
    constructor(conference) {
        super();

        this._conference = conference;

        this._remoteStreamsContext = new Map();
        this._localStreamContext = {};
        this._initialized = false;

        /**
         * {@link JitsiConference} bindings.
         */
        conference.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED, this._trackMuteChanged.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_ADDED, this._trackAdded.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_REMOVED, this._trackRemoved.bind(this));

        loadAudioSync().then((audioSyncInterface) => {
            this._audioSyncInterface = audioSyncInterface;
            this._audioSyncContext = this._audioSyncInterface._createAudioSyncContext();

            if (!this._audioSyncContext) {
                throw new Error('Failed to create AudioSyncContext!');
            }

            if (this._audioSyncInterface._setAudioSyncBufferSamples(PCM_SAMPLE_RATE, this._audioSyncContext) !== 0) {
                throw new Error('Failed to set buffer ms!');
            }

            if (this._audioSyncInterface._setAudioSyncSensitivity(0.1, this._audioSyncContext) !== 0) {
                throw new Error('Failed to set audio sync sensitivity!');
            }

            this._localInputBuffer = this._audioSyncInterface._malloc(PCM_SAMPLE_RATE * 4);
            this._localInputBufferIdx = this._localInputBuffer / 4;
            this._remoteInputBuffer = this._audioSyncInterface._malloc(PCM_SAMPLE_RATE * 4);
            this._remoteInputBufferIdx = this._remoteInputBuffer / 4;
            this._initialized = true;
        });
    }

    /**
     * Determines whether a specific {@link JitsiTrack} represents a local audio track.
     *
     * @param {JitsiTrack} track - The track to be checked whether it represents a local audio track.
     * @return {boolean} - true if the specified track represents a local audio track; otherwise, false.
     */
    _isLocalAudioTrack(track) {
        return track.isAudioTrack() && track.isLocal();
    }

    /**
     * Place holder.
     * @param {*} localSample
     * @param {*} remoteSample
     */
    _comparePCMSample(localSample, remoteSample) {

        if(!this._initialized) {
            logger.warn('AudioSync not initialized, skipping!');
            return;
        }

        if (localSample.length !== PCM_SAMPLE_RATE || remoteSample.length !== PCM_SAMPLE_RATE) {
            return;
        }

        this._audioSyncInterface.HEAPF32.set(localSample, this._localInputBufferIdx);
        this._audioSyncInterface.HEAPF32.set(remoteSample, this._remoteInputBufferIdx);


        // eslint-disable-next-line max-len
        const score = this._audioSyncInterface._getSyncScore(this._localInputBuffer, PCM_SAMPLE_RATE, this._remoteInputBuffer, PCM_SAMPLE_RATE, this._audioSyncContext);

        return score;
    }

    // /**
    //  * Place holder.
    //  *
    //  * @param {*} localStreamContext
    //  */
    // _processLocalPcm(localStreamContext, pcmSample) {
    //     localStreamContext.nextSample.push(...pcmSample.pcmData);
    //     const timestamp = new Date();

    //     // sample buffer is filled with 250 ms of PCM data add it to the sample array
    //     if (localStreamContext.nextSample.length >= LOCAL_SAMPLE_SIZE) {
    //         // This operation assumes that the pcmSample is not bigger than LOCAL_SAMPLE_SIZE.
    //         // nextSample will now contain the remainder of the current buffer if it overflowed.
    //         const currentSample = localStreamContext.nextSample.splice(0, LOCAL_SAMPLE_SIZE);

    //         const sampleContext = { pcmData: currentSample,
    //             timestamp };

    //         if (localStreamContext.sampleArray.length < LOCAL_SAMPLE_ARRAY_SIZE) {
    //             localStreamContext.sampleArray.push(sampleContext);
    //         } else {
    //             for (let i = 0; i < localStreamContext.sampleArray.length - 1; i++) {
    //                 localStreamContext.sampleArray[i] = localStreamContext.sampleArray[i + 1];
    //             }
    //             localStreamContext.sampleArray[localStreamContext.sampleArray - 1] = sampleContext;
    //         }
    //     }
    //     logger.log('Processing local stream: ', localStreamContext);
    // }

    /**
     * Place holder.
     *
     * @param {*} localStreamContext
     */
    _processLocalPcm(localStreamContext, pcmSample) {
        if (pcmSample.pcmData.length > PCM_SAMPLE_RATE) {
            throw new Error('Unexpected sample size: ', pcmSample.pcmData.length);
        }

        const timestamp = Date.now();
        const sampleContext = { pcmData: pcmSample.pcmData,
            timestamp };

        if (localStreamContext.sampleArray.length < LOCAL_SAMPLE_ARRAY_SIZE) {
            localStreamContext.sampleArray.push(sampleContext);
        } else {
            for (let i = 0; i < LOCAL_SAMPLE_ARRAY_SIZE - 1; i++) {
                localStreamContext.sampleArray[i] = localStreamContext.sampleArray[i + 1];
            }
            localStreamContext.sampleArray[LOCAL_SAMPLE_ARRAY_SIZE - 1] = sampleContext;
        }

        // const logObj = { ...localStreamContext };

        // logObj.sampleArray = [ ...localStreamContext.sampleArray ];

        // logger.log('Processing local stream: ', logObj);
    }

    /**
     * Place holder.
     *
     * @param {*} rmtStreamCtx
     */
    _processRemotePcm(rmtStreamCtx, pcmSample) {
        logger.log('Processing remote stream...');

        const currentTimeStamp = Date.now();
        if (pcmSample.pcmData.length > PCM_SAMPLE_RATE) {
            throw new Error('Unexpected sample size: ', pcmSample.pcmData.length);
        }
        const locSmpArray = this._localStreamContext.sampleArray;
        const locSmpArraySize = locSmpArray.length;

        if (locSmpArraySize < LOCAL_SAMPLE_ARRAY_SIZE) {
            logger.info('Local pcm array is fully buffered yet, current size:', locSmpArraySize);

            return;
        }

        if (rmtStreamCtx.currentHitTimeStamp > 0) {
            const smpIndex = locSmpArray.findIndex(smp => smp.timestamp === rmtStreamCtx.currentHitTimeStamp);

            // Timestamped index found.
            if (smpIndex >= 0) {
                logger.info('Sample index found id:', rmtStreamCtx.partId, '. at index:', smpIndex);

                if (smpIndex >= LOCAL_SAMPLE_ARRAY_SIZE - 1) {
                    logger.info('Local samples did not fill yet.');

                    // Should we return here?
                } else {
                    const targetIndex = smpIndex + 1;
                    const score = this._comparePCMSample(locSmpArray[targetIndex].pcmData, pcmSample.pcmData);

                    rmtStreamCtx.currentHitTimeStamp = locSmpArray[targetIndex].timestamp;
                    rmtStreamCtx.score.push({ score,
                        timestamp: locSmpArray[targetIndex].timestamp });

                    if (rmtStreamCtx.score.length === 12) {

                        var result = rmtStreamCtx.score.filter(scoreObj => scoreObj.score > 0.45);

                        let sum = 0;
                        for(const currentSc of rmtStreamCtx.score) {
                            sum += currentSc.score;
                        }

                        let avg = sum / rmtStreamCtx.score.length;

                        let reason = 'AVG: ' + avg + ' COUNTER: ' + result.length

                        if (result.length > 6 || avg > 0.45) {
                            this.emit(ECHO_DETECTED, {
                                    count: result.length,
                                    deviceLabel: rmtStreamCtx.label,
                                    reason
                                });
                        }

                        logger.info('Result reached: ', reason, rmtStreamCtx.score);
                        rmtStreamCtx.currentHitTimeStamp = 0;
                        rmtStreamCtx.score = [];
                        // rmtStreamCtx.pcmGenerator.stop();
                        // rmtStreamCtx.pcmGenerator.destroy();
                        rmtStreamCtx.currentHitTimeStamp = 0;
                    }
                }
            } else {
                logger.info(
                    'Sample index not found for ',
                    rmtStreamCtx.partId,
                    '. ts: ',
                    rmtStreamCtx.currentHitTimeStamp
                );
                logger.info('Clearing results');
                rmtStreamCtx.currentHitTimeStamp = 0;
                rmtStreamCtx.score = [];
            }
        } else {
            for (let i = LOCAL_SAMPLE_ARRAY_SIZE - 1; i >= 0; i--) {
                const score = this._comparePCMSample(pcmSample.pcmData, locSmpArray[i].pcmData);

                if (score > 0.45) {
                    rmtStreamCtx.currentHitTimeStamp = locSmpArray[i].timestamp;
                    rmtStreamCtx.score.push({ score,
                        timestamp: locSmpArray[i].timestamp });
                    logger.info('Hit on ', rmtStreamCtx.partId, '.Local TS:', rmtStreamCtx.currentHitTimeStamp, '. Remote TS:', currentTimeStamp, '. Score: ', score);
                    break;
                } else {
                    logger.info('Fail hit on ', rmtStreamCtx.partId, '. TS:', locSmpArray[i].timestamp, '. Score: ', score);
                }
            }
        }

    }

    /**
     * Notifies the detector that a track was added to the associated {@link JitsiConference}.
     * Only take into account local audio tracks.
     * @param {JitsiTrack} track - The added track.
     * @returns {void}
     * @listens TRACK_ADDED
     */
    _trackAdded(track) {
        if (track.isAudioTrack()) {
            if (track.isLocal()) {
                logger.info('Local audio track added;');

                PCMGenerator.create(track.getDeviceId(), PCM_SAMPLE_RATE, PCM_SAMPLE_FREQUENCY).then(pcmGenerator => {
                    this._localStreamContext = {};
                    this._localStreamContext.trackId = track.getDeviceId();
                    this._localStreamContext.sampleArray = [];
                    this._localStreamContext.nextSample = new Float32Array();
                    this._localStreamContext.currentHitTImeStamp = {};
                    this._localStreamContext.pcmGenerator = pcmGenerator;
                    pcmGenerator.on(PCM_SAMPLE_PUBLISHED, pcmSample => {
                        this._processLocalPcm(this._localStreamContext, pcmSample);
                    });
                    pcmGenerator.start();
                });
            } else {
                logger.info('Remote audio track added;');
                PCMGenerator.create(track.getParticipantId(), PCM_SAMPLE_RATE, PCM_SAMPLE_FREQUENCY).then(
                    pcmGenerator => {
                        const partId = track.getParticipantId();

                        this._remoteStreamsContext[partId] = {};
                        const remoteStream = this._remoteStreamsContext[partId];

                        remoteStream.partId = partId;
                        remoteStream.trackId = track.getTrackId();
                        remoteStream.partId = partId;
                        remoteStream.track = track;
                        remoteStream.ssrc = track.getSSRC();
                        remoteStream.label = track.getTrackLabel();
                        remoteStream.score = [];
                        remoteStream.currentHitTimeStamp = {};
                        remoteStream.pcmGenerator = pcmGenerator;
                        pcmGenerator.on(PCM_SAMPLE_PUBLISHED, pcmSample => {
                            this._processRemotePcm(remoteStream, pcmSample);
                        });
                        pcmGenerator.start();
                    }
                );
            }
        }
    }

    /**
     * Notifies the detector that the mute state of a {@link JitsiConference} track has changed. Only takes into account
     * local audio tracks. In case the track was muted the detector starts the {@link TrackVADEmitter} otherwise it's
     * stopped.
     * @param {JitsiTrack} track - The track whose mute state has changed.
     * @returns {void}
     * @listens TRACK_MUTE_CHANGED
     */
    _trackMuteChanged(track) {
        if (track.isAudioTrack()) {
            if (track.isLocal()) {
                logger.info('Local audio track mute state changed;');
            } else {
                logger.info('Remote audio track mute state changed;');
            }
        }
    }

    /**
     * Notifies the detector that a track associated with the {@link JitsiConference} was removed. Only takes into
     * account local audio tracks. Cleans up resources associated with the track and resets the processing context.
     *
     * @param {JitsiTrack} track - The removed track.
     * @returns {void}
     * @listens TRACK_REMOVED
     */
    _trackRemoved(track) {
        if (track.isAudioTrack()) {
            if (track.isLocal()) {
                logger.info('Local audio track removed;');
            } else {
                logger.info('Remote audio track removed;');
            }
        }
    }
}
