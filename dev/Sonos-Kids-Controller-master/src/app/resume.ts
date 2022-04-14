export interface Resume {
    player?: string;
    spotify?:{
        id?: string;
        track_number?: number;
        progress_ms?: number;
    }
    local: {
        album?: string;
        currentTracknr?: number;
        progressTime?: number;
    }
}