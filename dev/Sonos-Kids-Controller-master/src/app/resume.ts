export interface Resume {
    spotify?:{
        track_number?: number;
        progress_ms?: number;
        duration_ms?: number;
    }
    local?:{
        album?: string;
        currentTracknr?: number;
        progressTime?: number;
    }
    show?:{
        album?: string;
        progress_ms?: number;
        duration_ms?: number;
    }
}