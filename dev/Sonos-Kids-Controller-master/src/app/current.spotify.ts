export interface CURRENTSPOTIFY {
    progress_ms?: number;
    item?: {
        album?: {
            id?: string;
            name?: string;
            total_tracks?: number;
        };
        duration_ms?: number;
        id?: string;
        name?: string;
        track_number?: number;
    };
}