import EventEmitter from 'events';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import PCMGenerator from './PCMGenerator';
import { PCM_SAMPLE_PUBLISHED } from '../DetectionEvents';
import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);

/**
 * Sample rate of TrackVADEmitter, it defines how many audio samples are processed at a time.
 * @type {number}
 */
const PCM_PCM_SAMPLE_RATE = 4096;

/**
 * Time span over which we calculate an average score used to determine if we trigger the event.
 * @type {number}
 */
const PCM_SAMPLE_FREQUENCY = 44100;

/**
 * Place holder.
 */
export default class EchoDetector extends EventEmitter {
    /**
     * Place Holder
     * @param {*} conference - Place holder.
     */
    constructor(conference) {
        super();

        this._conference = conference;

        this._remoteStreamsContext = new Map();
        this._localStreamContext = {};

        /**
         * {@link JitsiConference} bindings.
         */
        conference.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED, this._trackMuteChanged.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_ADDED, this._trackAdded.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_REMOVED, this._trackRemoved.bind(this));
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

                PCMGenerator.create(track.getDeviceId(), PCM_PCM_SAMPLE_RATE, PCM_SAMPLE_FREQUENCY).then(
                    pcmGenerator => {
                        this._localStreamContext = {};
                        this._localStreamContext.trackId = track.getDeviceId();
                        this._localStreamContext.buffer = [];
                        this._localStreamContext.currentHitTImeStamp = {};
                        this._localStreamContext.pcmGenerator = pcmGenerator;
                        pcmGenerator.on(PCM_SAMPLE_PUBLISHED, this._processLocalPcm(this._localStreamContext));
                    }
                );
            } else {
                logger.info('Remote audio track added;');
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
