export interface Media {
    index?: number;
    artist?: string;
    title?: string;
    query?: string;
    id?: string;
    artistid?: string;
    showid?: string;
    playlistid?: string;
    release_date?: string;
    cover?: string;
    type: string;
    category: string;
    artistcover?: string;
    shuffle?: boolean;
    aPartOfAll?: boolean;
    aPartOfAllMin?: number;
    aPartOfAllMax?: number;
    duration?: string;
    spotify_url?: string;
    resume?: Resume;
}

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
    rss?:{
        progressTime?: number;
    }
}
