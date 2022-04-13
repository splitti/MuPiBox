export interface CurrentMPlayer {
    player?: string;
    playing?: boolean;
    album?: string;
    currentTrackname?: string;
    currentTracknr?: number;
    totalTracks?: number;
    progressTime?: number;
    volume?: number;
}