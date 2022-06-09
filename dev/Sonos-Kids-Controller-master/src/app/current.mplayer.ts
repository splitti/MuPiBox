export interface CurrentMPlayer {
    activePlaylist?: string,
    totalPlaylist?: number,
    activeShow?: string,
    totalShows?: number,
    currentPlayer?: string;
    playing?: boolean;
    album?: string;
    currentTrackname?: string;
    currentTracknr?: number;
    totalTracks?: number;
    progressTime?: number;
    volume?: number;
}